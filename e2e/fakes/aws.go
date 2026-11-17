package main

import (
	"archive/zip"
	"bytes"
	"encoding/base64"
	"encoding/json"
	"encoding/xml"
	"fmt"
	"io"
	"net"
	"net/http"
	"regexp"
	"slices"
	"sort"
	"strings"
	"sync"
	"time"
)

const awsAccount = "123456789012"

type awsFunction struct {
	Name        string
	Role        string
	Environment map[string]string
	URL         string
	Permissions []string
}

type awsState struct {
	calls  callLog
	region string

	mu          sync.Mutex
	identities  map[string]bool
	roles       map[string]string
	policies    map[string]bool
	queues      map[string]bool
	functions   map[string]*awsFunction
	ruleSets    map[string][]string
	activeSet   string
	buckets     map[string]bool
	bucketRules map[string]bool
}

func newAWSState(region string) *awsState {
	return &awsState{
		region:      region,
		identities:  map[string]bool{},
		roles:       map[string]string{},
		policies:    map[string]bool{},
		queues:      map[string]bool{},
		functions:   map[string]*awsFunction{},
		ruleSets:    map[string][]string{},
		buckets:     map[string]bool{},
		bucketRules: map[string]bool{},
	}
}

func escape(value string) string {
	var out bytes.Buffer
	_ = xml.EscapeText(&out, []byte(value))
	return out.String()
}

func requestID() string {
	return newID()
}

func queryResponse(w http.ResponseWriter, action, namespace, result string) {
	w.Header().Set("content-type", "text/xml")
	w.WriteHeader(http.StatusOK)
	fmt.Fprintf(w, `<%[1]sResponse xmlns="%[2]s"><%[1]sResult>%[3]s</%[1]sResult><ResponseMetadata><RequestId>%[4]s</RequestId></ResponseMetadata></%[1]sResponse>`,
		action, namespace, result, requestID())
}

func queryError(w http.ResponseWriter, status int, code, message string) {
	w.Header().Set("content-type", "text/xml")
	w.WriteHeader(status)
	fmt.Fprintf(w, `<ErrorResponse><Error><Type>Sender</Type><Code>%s</Code><Message>%s</Message></Error><RequestId>%s</RequestId></ErrorResponse>`,
		escape(code), escape(message), requestID())
}

func restError(w http.ResponseWriter, status int, code, message string) {
	w.Header().Set("x-amzn-errortype", code)
	writeJSON(w, status, map[string]string{"__type": code, "Type": "User", "Message": message, "message": message})
}

func (a *awsState) handle(w http.ResponseWriter, r *http.Request, ses http.HandlerFunc) {
	host, _, err := net.SplitHostPort(r.Host)
	if err != nil {
		host = r.Host
	}
	host = strings.ToLower(host)
	region := a.region + ".amazonaws.com"
	switch {
	case host == "email."+region && r.URL.Path == "/v2/email/outbound-emails":
		ses(w, r)
	case host == "email."+region && strings.HasPrefix(r.URL.Path, "/v2/email/"):
		a.sesv2(w, r)
	case host == "email."+region:
		a.query(w, r, "http://ses.amazonaws.com/doc/2010-12-01/", a.sesv1)
	case host == "sts."+region:
		a.query(w, r, "https://sts.amazonaws.com/doc/2011-06-15/", a.sts)
	case host == "iam.amazonaws.com":
		a.query(w, r, "https://iam.amazonaws.com/doc/2010-05-08/", a.iam)
	case host == "sqs."+region:
		a.sqs(w, r)
	case host == "lambda."+region:
		a.lambda(w, r)
	case strings.HasSuffix(host, ".s3."+region):
		a.s3(w, r, strings.TrimSuffix(host, ".s3."+region))
	default:
		restError(w, http.StatusNotFound, "UnknownEndpoint", "No fake answers for "+host)
	}
}

type queryHandler func(w http.ResponseWriter, action, namespace string, form map[string][]string)

func (a *awsState) query(w http.ResponseWriter, r *http.Request, namespace string, handler queryHandler) {
	if err := r.ParseForm(); err != nil {
		queryError(w, http.StatusBadRequest, "MalformedQueryString", err.Error())
		return
	}
	action := r.PostForm.Get("Action")
	a.mu.Lock()
	defer a.mu.Unlock()
	handler(w, action, namespace, r.PostForm)
}

func first(form map[string][]string, key string) string {
	if values := form[key]; len(values) > 0 {
		return values[0]
	}
	return ""
}

func (a *awsState) sts(w http.ResponseWriter, action, namespace string, _ map[string][]string) {
	if action != "GetCallerIdentity" {
		queryError(w, http.StatusBadRequest, "InvalidAction", action)
		return
	}
	a.calls.add("sts", action, awsAccount, nil)
	queryResponse(w, action, namespace, fmt.Sprintf(
		"<Arn>arn:aws:iam::%[1]s:user/metis-e2e</Arn><UserId>AIDAE2E</UserId><Account>%[1]s</Account>", awsAccount))
}

func roleXML(name, arn string) string {
	id := strings.ToUpper(strings.ReplaceAll(name, "-", ""))
	id = id[:min(10, len(id))]
	return fmt.Sprintf("<Role><Path>/</Path><RoleName>%s</RoleName><RoleId>AROAE2E%s</RoleId><Arn>%s</Arn><CreateDate>%s</CreateDate></Role>",
		escape(name), escape(id), escape(arn), time.Unix(0, 0).UTC().Format(time.RFC3339))
}

func (a *awsState) iam(w http.ResponseWriter, action, namespace string, form map[string][]string) {
	name := first(form, "RoleName")
	switch action {
	case "CreateRole":
		if _, exists := a.roles[name]; exists {
			queryError(w, http.StatusConflict, "EntityAlreadyExists", "Role with name "+name+" already exists.")
			return
		}
		arn := fmt.Sprintf("arn:aws:iam::%s:role/%s", awsAccount, name)
		a.roles[name] = arn
		a.calls.add("iam", action, name, nil)
		queryResponse(w, action, namespace, roleXML(name, arn))
	case "GetRole":
		arn, exists := a.roles[name]
		if !exists {
			queryError(w, http.StatusNotFound, "NoSuchEntity", "The role with name "+name+" cannot be found.")
			return
		}
		queryResponse(w, action, namespace, roleXML(name, arn))
	case "PutRolePolicy":
		if _, exists := a.roles[name]; !exists {
			queryError(w, http.StatusNotFound, "NoSuchEntity", "The role with name "+name+" cannot be found.")
			return
		}
		a.policies[name+"/"+first(form, "PolicyName")] = true
		a.calls.add("iam", action, name, map[string]string{"policy": first(form, "PolicyName")})
		queryResponse(w, action, namespace, "")
	case "DeleteRolePolicy":
		key := name + "/" + first(form, "PolicyName")
		if !a.policies[key] {
			queryError(w, http.StatusNotFound, "NoSuchEntity", "The role policy with name "+first(form, "PolicyName")+" cannot be found.")
			return
		}
		delete(a.policies, key)
		a.calls.add("iam", action, name, nil)
		queryResponse(w, action, namespace, "")
	case "DeleteRole":
		if _, exists := a.roles[name]; !exists {
			queryError(w, http.StatusNotFound, "NoSuchEntity", "The role with name "+name+" cannot be found.")
			return
		}
		delete(a.roles, name)
		a.calls.add("iam", action, name, nil)
		queryResponse(w, action, namespace, "")
	default:
		queryError(w, http.StatusBadRequest, "InvalidAction", action)
	}
}

func (a *awsState) sesv1(w http.ResponseWriter, action, namespace string, form map[string][]string) {
	set := first(form, "RuleSetName")
	switch action {
	case "DescribeActiveReceiptRuleSet":
		if a.activeSet == "" {
			queryResponse(w, action, namespace, "")
			return
		}
		var rules strings.Builder
		for _, rule := range a.ruleSets[a.activeSet] {
			fmt.Fprintf(&rules, "<member><Name>%s</Name><Enabled>true</Enabled><ScanEnabled>true</ScanEnabled><TlsPolicy>Optional</TlsPolicy></member>", escape(rule))
		}
		queryResponse(w, action, namespace, fmt.Sprintf("<Metadata><Name>%s</Name><CreatedTimestamp>%s</CreatedTimestamp></Metadata><Rules>%s</Rules>",
			escape(a.activeSet), time.Unix(0, 0).UTC().Format(time.RFC3339), rules.String()))
	case "CreateReceiptRuleSet":
		if _, exists := a.ruleSets[set]; exists {
			queryError(w, http.StatusBadRequest, "AlreadyExists", "Rule set "+set+" already exists")
			return
		}
		a.ruleSets[set] = []string{}
		a.calls.add("ses", action, set, nil)
		queryResponse(w, action, namespace, "")
	case "SetActiveReceiptRuleSet":
		if _, exists := a.ruleSets[set]; !exists {
			queryError(w, http.StatusBadRequest, "RuleSetDoesNotExist", "Rule set "+set+" does not exist")
			return
		}
		a.activeSet = set
		a.calls.add("ses", action, set, nil)
		queryResponse(w, action, namespace, "")
	case "CreateReceiptRule", "UpdateReceiptRule":
		rule := first(form, "Rule.Name")
		rules, exists := a.ruleSets[set]
		if !exists {
			queryError(w, http.StatusBadRequest, "RuleSetDoesNotExist", "Rule set "+set+" does not exist")
			return
		}
		present := slices.Contains(rules, rule)
		if action == "CreateReceiptRule" && present {
			queryError(w, http.StatusBadRequest, "AlreadyExists", "Rule "+rule+" already exists")
			return
		}
		if action == "UpdateReceiptRule" && !present {
			queryError(w, http.StatusBadRequest, "RuleDoesNotExist", "Rule "+rule+" does not exist")
			return
		}
		if !present {
			a.ruleSets[set] = append(rules, rule)
		}
		a.calls.add("ses", action, rule, map[string]string{
			"ruleSet":   set,
			"recipient": first(form, "Rule.Recipients.member.1"),
			"bucket":    first(form, "Rule.Actions.member.1.S3Action.BucketName"),
			"function":  first(form, "Rule.Actions.member.2.LambdaAction.FunctionArn"),
		})
		queryResponse(w, action, namespace, "")
	case "DeleteReceiptRule":
		rule := first(form, "RuleName")
		index := slices.Index(a.ruleSets[set], rule)
		if index < 0 {
			queryError(w, http.StatusBadRequest, "RuleDoesNotExist", "Rule "+rule+" does not exist")
			return
		}
		a.ruleSets[set] = slices.Delete(a.ruleSets[set], index, index+1)
		a.calls.add("ses", action, rule, map[string]string{"ruleSet": set})
		queryResponse(w, action, namespace, "")
	default:
		queryError(w, http.StatusBadRequest, "InvalidAction", action)
	}
}

func identityBody(verified bool) map[string]any {
	status := "PENDING"
	if verified {
		status = "SUCCESS"
	}
	return map[string]any{
		"IdentityType":             "DOMAIN",
		"VerifiedForSendingStatus": verified,
		"VerificationStatus":       status,
		"DkimAttributes": map[string]any{
			"SigningEnabled": true, "Status": status, "Tokens": []string{"e2edkim1", "e2edkim2", "e2edkim3"},
		},
	}
}

func (a *awsState) sesv2(w http.ResponseWriter, r *http.Request) {
	a.mu.Lock()
	defer a.mu.Unlock()
	path := r.URL.Path
	switch {
	case r.Method == http.MethodGet && strings.HasPrefix(path, "/v2/email/identities/"):
		identity := strings.ToLower(strings.TrimPrefix(path, "/v2/email/identities/"))
		if !a.identities[identity] {
			restError(w, http.StatusNotFound, "NotFoundException", "Email identity "+identity+" does not exist.")
			return
		}
		writeJSON(w, http.StatusOK, identityBody(true))
	case r.Method == http.MethodPost && path == "/v2/email/identities":
		identity := strings.ToLower(text(readJSON(r), "EmailIdentity"))
		if a.identities[identity] {
			restError(w, http.StatusConflict, "AlreadyExistsException", "Email identity "+identity+" already exist.")
			return
		}
		a.identities[identity] = true
		a.calls.add("sesv2", "CreateEmailIdentity", identity, nil)
		writeJSON(w, http.StatusOK, identityBody(false))
	case r.Method == http.MethodGet && path == "/v2/email/account":
		writeJSON(w, http.StatusOK, map[string]any{
			"ProductionAccessEnabled": true, "SendingEnabled": true, "EnforcementStatus": "HEALTHY",
			"DedicatedIpAutoWarmupEnabled": false,
		})
	case r.Method == http.MethodPut && path == "/v2/email/account/details":
		a.calls.add("sesv2", "PutAccountDetails", "account", nil)
		writeJSON(w, http.StatusOK, map[string]any{})
	default:
		restError(w, http.StatusNotFound, "NotFoundException", fmt.Sprintf("No route for %s %s", r.Method, path))
	}
}

func (a *awsState) queueURL(name string) string {
	return fmt.Sprintf("https://sqs.%s.amazonaws.com/%s/%s", a.region, awsAccount, name)
}

func sqsError(w http.ResponseWriter) {
	w.Header().Set("x-amzn-query-error", "AWS.SimpleQueueService.NonExistentQueue;Sender")
	w.Header().Set("content-type", "application/x-amz-json-1.0")
	w.WriteHeader(http.StatusBadRequest)
	_ = json.NewEncoder(w).Encode(map[string]string{
		"__type": "com.amazonaws.sqs#QueueDoesNotExist", "message": "The specified queue does not exist.",
	})
}

func (a *awsState) sqs(w http.ResponseWriter, r *http.Request) {
	action := strings.TrimPrefix(r.Header.Get("x-amz-target"), "AmazonSQS.")
	body := readJSON(r)
	a.mu.Lock()
	defer a.mu.Unlock()
	reply := func(value any) {
		w.Header().Set("content-type", "application/x-amz-json-1.0")
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(value)
	}
	nameOf := func(url string) string { return url[strings.LastIndex(url, "/")+1:] }
	switch action {
	case "CreateQueue":
		name := text(body, "QueueName")
		a.queues[name] = true
		a.calls.add("sqs", action, name, nil)
		reply(map[string]string{"QueueUrl": a.queueURL(name)})
	case "GetQueueUrl":
		name := text(body, "QueueName")
		if !a.queues[name] {
			sqsError(w)
			return
		}
		reply(map[string]string{"QueueUrl": a.queueURL(name)})
	case "GetQueueAttributes":
		name := nameOf(text(body, "QueueUrl"))
		if !a.queues[name] {
			sqsError(w)
			return
		}
		reply(map[string]any{"Attributes": map[string]string{
			"QueueArn":                    fmt.Sprintf("arn:aws:sqs:%s:%s:%s", a.region, awsAccount, name),
			"ApproximateNumberOfMessages": "0",
		}})
	case "DeleteQueue":
		name := nameOf(text(body, "QueueUrl"))
		if !a.queues[name] {
			sqsError(w)
			return
		}
		delete(a.queues, name)
		a.calls.add("sqs", action, name, nil)
		reply(map[string]any{})
	default:
		restError(w, http.StatusBadRequest, "InvalidAction", action)
	}
}

var (
	lambdaFunction = regexp.MustCompile(`^/2015-03-31/functions/([^/]+)$`)
	lambdaCode     = regexp.MustCompile(`^/2015-03-31/functions/([^/]+)/code$`)
	lambdaConfig   = regexp.MustCompile(`^/2015-03-31/functions/([^/]+)/configuration$`)
	lambdaPolicy   = regexp.MustCompile(`^/2015-03-31/functions/([^/]+)/policy$`)
	lambdaURL      = regexp.MustCompile(`^/2021-10-31/functions/([^/]+)/url$`)
	lambdaEvent    = regexp.MustCompile(`^/2019-09-25/functions/([^/]+)/event-invoke-config$`)
)

func (a *awsState) functionArn(name string) string {
	return fmt.Sprintf("arn:aws:lambda:%s:%s:function:%s", a.region, awsAccount, name)
}

func (a *awsState) configuration(fn *awsFunction) map[string]any {
	return map[string]any{
		"FunctionName":     fn.Name,
		"FunctionArn":      a.functionArn(fn.Name),
		"Runtime":          "nodejs24.x",
		"Role":             fn.Role,
		"Handler":          "index.handler",
		"Architectures":    []string{"arm64"},
		"State":            "Active",
		"LastUpdateStatus": "Successful",
		"Environment":      map[string]any{"Variables": fn.Environment},
	}
}

func (a *awsState) urlConfig(fn *awsFunction) map[string]any {
	stamp := time.Unix(0, 0).UTC().Format(time.RFC3339)
	return map[string]any{
		"FunctionUrl": fn.URL, "FunctionArn": a.functionArn(fn.Name), "AuthType": "NONE",
		"InvokeMode": "RESPONSE_STREAM", "CreationTime": stamp, "LastModifiedTime": stamp,
	}
}

func checkZip(encoded string) error {
	raw, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		return fmt.Errorf("ZipFile is not base64: %w", err)
	}
	archive, err := zip.NewReader(bytes.NewReader(raw), int64(len(raw)))
	if err != nil {
		return fmt.Errorf("ZipFile is not a zip: %w", err)
	}
	for _, file := range archive.File {
		if file.Name == "index.mjs" {
			return nil
		}
	}
	return fmt.Errorf("the zip has no index.mjs")
}

func environment(body map[string]any) map[string]string {
	out := map[string]string{}
	block, _ := body["Environment"].(map[string]any)
	variables, _ := block["Variables"].(map[string]any)
	for key, value := range variables {
		out[key] = fmt.Sprint(value)
	}
	return out
}

func sortedKeys(values map[string]string) string {
	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return strings.Join(keys, ",")
}

func (a *awsState) lambda(w http.ResponseWriter, r *http.Request) {
	path := r.URL.Path
	body := map[string]any{}
	if r.Method == http.MethodPost || r.Method == http.MethodPut {
		raw, _ := io.ReadAll(io.LimitReader(r.Body, 128<<20))
		_ = json.Unmarshal(raw, &body)
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	lookup := func(pattern *regexp.Regexp) (*awsFunction, string, bool) {
		match := pattern.FindStringSubmatch(path)
		if match == nil {
			return nil, "", false
		}
		fn := a.functions[match[1]]
		if fn == nil {
			restError(w, http.StatusNotFound, "ResourceNotFoundException", "Function not found: "+a.functionArn(match[1]))
		}
		return fn, match[1], true
	}
	switch {
	case r.Method == http.MethodPost && path == "/2015-03-31/functions":
		name := text(body, "FunctionName")
		if a.functions[name] != nil {
			restError(w, http.StatusConflict, "ResourceConflictException", "Function already exist: "+name)
			return
		}
		code, _ := body["Code"].(map[string]any)
		if err := checkZip(text(code, "ZipFile")); err != nil {
			restError(w, http.StatusBadRequest, "InvalidParameterValueException", err.Error())
			return
		}
		fn := &awsFunction{Name: name, Role: text(body, "Role"), Environment: environment(body)}
		a.functions[name] = fn
		a.calls.add("lambda", "CreateFunction", name, map[string]string{"role": fn.Role, "environment": sortedKeys(fn.Environment)})
		writeJSON(w, http.StatusCreated, a.configuration(fn))
	case r.Method == http.MethodGet && lambdaFunction.MatchString(path):
		if fn, _, _ := lookup(lambdaFunction); fn != nil {
			writeJSON(w, http.StatusOK, map[string]any{"Configuration": a.configuration(fn), "Code": map[string]string{"RepositoryType": "S3"}})
		}
	case r.Method == http.MethodDelete && lambdaFunction.MatchString(path):
		if fn, name, _ := lookup(lambdaFunction); fn != nil {
			delete(a.functions, name)
			a.calls.add("lambda", "DeleteFunction", name, nil)
			w.WriteHeader(http.StatusNoContent)
		}
	case r.Method == http.MethodPut && lambdaCode.MatchString(path):
		if fn, name, _ := lookup(lambdaCode); fn != nil {
			if err := checkZip(text(body, "ZipFile")); err != nil {
				restError(w, http.StatusBadRequest, "InvalidParameterValueException", err.Error())
				return
			}
			a.calls.add("lambda", "UpdateFunctionCode", name, nil)
			writeJSON(w, http.StatusOK, a.configuration(fn))
		}
	case r.Method == http.MethodPut && lambdaConfig.MatchString(path):
		if fn, name, _ := lookup(lambdaConfig); fn != nil {
			fn.Environment = environment(body)
			fn.Role = text(body, "Role")
			a.calls.add("lambda", "UpdateFunctionConfiguration", name, map[string]string{"environment": sortedKeys(fn.Environment)})
			writeJSON(w, http.StatusOK, a.configuration(fn))
		}
	case r.Method == http.MethodPost && lambdaPolicy.MatchString(path):
		if fn, name, _ := lookup(lambdaPolicy); fn != nil {
			statement := text(body, "StatementId")
			if slices.Contains(fn.Permissions, statement) {
				restError(w, http.StatusConflict, "ResourceConflictException", "The statement id ("+statement+") provided already exists.")
				return
			}
			fn.Permissions = append(fn.Permissions, statement)
			a.calls.add("lambda", "AddPermission", name, map[string]string{"statement": statement, "principal": text(body, "Principal")})
			writeJSON(w, http.StatusCreated, map[string]string{"Statement": fmt.Sprintf(`{"Sid":%q}`, statement)})
		}
	case lambdaURL.MatchString(path):
		fn, name, _ := lookup(lambdaURL)
		if fn == nil {
			return
		}
		switch r.Method {
		case http.MethodGet:
			if fn.URL == "" {
				restError(w, http.StatusNotFound, "ResourceNotFoundException", "The resource you requested does not exist.")
				return
			}
			writeJSON(w, http.StatusOK, a.urlConfig(fn))
		case http.MethodPost:
			if fn.URL != "" {
				restError(w, http.StatusConflict, "ResourceConflictException", "Failed to create function url config for [functionArn = "+a.functionArn(name)+"]. Error message:  FunctionUrlConfig exists for this Lambda function")
				return
			}
			fn.URL = fmt.Sprintf("https://%s.lambda-url.%s.on.aws/", strings.ReplaceAll(name, "-", ""), a.region)
			a.calls.add("lambda", "CreateFunctionUrlConfig", name, map[string]string{"invokeMode": text(body, "InvokeMode")})
			writeJSON(w, http.StatusCreated, a.urlConfig(fn))
		case http.MethodDelete:
			if fn.URL == "" {
				restError(w, http.StatusNotFound, "ResourceNotFoundException", "The resource you requested does not exist.")
				return
			}
			fn.URL = ""
			a.calls.add("lambda", "DeleteFunctionUrlConfig", name, nil)
			w.WriteHeader(http.StatusNoContent)
		default:
			restError(w, http.StatusMethodNotAllowed, "InvalidRequestException", r.Method)
		}
	case r.Method == http.MethodPut && lambdaEvent.MatchString(path):
		if _, name, _ := lookup(lambdaEvent); a.functions[name] != nil {
			a.calls.add("lambda", "PutFunctionEventInvokeConfig", name, map[string]string{"maximumRetryAttempts": fmt.Sprint(body["MaximumRetryAttempts"])})
			writeJSON(w, http.StatusOK, map[string]any{"FunctionArn": a.functionArn(name), "MaximumRetryAttempts": body["MaximumRetryAttempts"]})
		}
	default:
		restError(w, http.StatusNotFound, "ResourceNotFoundException", fmt.Sprintf("No route for %s %s", r.Method, path))
	}
}

func s3Error(w http.ResponseWriter, status int, code, message string) {
	w.Header().Set("content-type", "application/xml")
	w.WriteHeader(status)
	fmt.Fprintf(w, `<?xml version="1.0" encoding="UTF-8"?><Error><Code>%s</Code><Message>%s</Message><RequestId>%s</RequestId></Error>`,
		escape(code), escape(message), requestID())
}

func (a *awsState) s3(w http.ResponseWriter, r *http.Request, bucket string) {
	query := r.URL.Query()
	a.mu.Lock()
	defer a.mu.Unlock()
	exists := a.buckets[bucket]
	if !exists && !(r.Method == http.MethodPut && len(query) == 0) {
		s3Error(w, http.StatusNotFound, "NoSuchBucket", "The specified bucket does not exist")
		return
	}
	switch {
	case r.Method == http.MethodPut && len(query) == 0:
		if exists {
			s3Error(w, http.StatusConflict, "BucketAlreadyOwnedByYou", "Your previous request to create the named bucket succeeded and you already own it.")
			return
		}
		a.buckets[bucket] = true
		a.calls.add("s3", "CreateBucket", bucket, nil)
		w.Header().Set("location", "/"+bucket)
		w.WriteHeader(http.StatusOK)
	case r.Method == http.MethodPut && query.Has("policy"):
		a.bucketRules[bucket] = true
		a.calls.add("s3", "PutBucketPolicy", bucket, nil)
		w.WriteHeader(http.StatusNoContent)
	case r.Method == http.MethodGet && query.Get("list-type") == "2":
		w.Header().Set("content-type", "application/xml")
		fmt.Fprintf(w, `<?xml version="1.0" encoding="UTF-8"?><ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><Name>%s</Name><Prefix></Prefix><KeyCount>0</KeyCount><MaxKeys>1000</MaxKeys><IsTruncated>false</IsTruncated></ListBucketResult>`, escape(bucket))
	case r.Method == http.MethodPost && query.Has("delete"):
		w.Header().Set("content-type", "application/xml")
		fmt.Fprint(w, `<?xml version="1.0" encoding="UTF-8"?><DeleteResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/"></DeleteResult>`)
	case r.Method == http.MethodDelete && len(query) == 0:
		delete(a.buckets, bucket)
		delete(a.bucketRules, bucket)
		a.calls.add("s3", "DeleteBucket", bucket, nil)
		w.WriteHeader(http.StatusNoContent)
	default:
		s3Error(w, http.StatusNotImplemented, "NotImplemented", fmt.Sprintf("%s %s is not faked", r.Method, r.URL.RequestURI()))
	}
}
