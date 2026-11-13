package ses

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/iam"
	"github.com/aws/aws-sdk-go-v2/service/lambda"
	lambdatypes "github.com/aws/aws-sdk-go-v2/service/lambda/types"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	s3types "github.com/aws/aws-sdk-go-v2/service/s3/types"
	sesv1 "github.com/aws/aws-sdk-go-v2/service/ses"
	sestypes "github.com/aws/aws-sdk-go-v2/service/ses/types"
	"github.com/aws/aws-sdk-go-v2/service/sesv2"
	sesv2types "github.com/aws/aws-sdk-go-v2/service/sesv2/types"
	"github.com/aws/aws-sdk-go-v2/service/sqs"
	sqstypes "github.com/aws/aws-sdk-go-v2/service/sqs/types"
	"github.com/aws/aws-sdk-go-v2/service/sts"
	"github.com/aws/smithy-go"

	"github.com/trymetis/metis/apps/cli/internal/cloudflare"
	"github.com/trymetis/metis/apps/cli/internal/gateways"
)

var ReceivingRegions = []string{
	"us-east-1", "us-east-2", "us-west-1", "us-west-2", "ca-central-1", "eu-central-1", "eu-west-1", "eu-west-2",
	"eu-west-3", "eu-south-1", "eu-north-1", "ap-south-1", "ap-southeast-1", "ap-southeast-2", "ap-southeast-3",
	"ap-northeast-1", "ap-northeast-2", "ap-northeast-3", "af-south-1", "il-central-1", "me-south-1", "sa-east-1",
}

const (
	DefaultRuleSet = "metis"
	memoryMB       = 1024
	timeoutSeconds = 60
)

func ResourceName(domain string) string {
	return "metis-ses-" + gateways.Slug(domain)
}

type Client struct {
	Region  string
	Account string
	cfg     aws.Config
	s3      *s3.Client
	sesv1   *sesv1.Client
	sesv2   *sesv2.Client
	lambda  *lambda.Client
	iam     *iam.Client
	sqs     *sqs.Client
}

func New(ctx context.Context, region string) (*Client, error) {
	if !slices.Contains(ReceivingRegions, region) {
		return nil, fmt.Errorf("%s is not an SES receiving region; use one of %s", region, strings.Join(ReceivingRegions, ", "))
	}
	cfg, err := config.LoadDefaultConfig(ctx, config.WithRegion(region))
	if err != nil {
		return nil, fmt.Errorf("loading AWS credentials: %w", err)
	}
	identity, err := sts.NewFromConfig(cfg).GetCallerIdentity(ctx, &sts.GetCallerIdentityInput{})
	if err != nil {
		return nil, fmt.Errorf("checking the AWS credentials (AWS_PROFILE, AWS_ACCESS_KEY_ID, …): %w", err)
	}
	return &Client{
		Region:  region,
		Account: aws.ToString(identity.Account),
		cfg:     cfg,
		s3:      s3.NewFromConfig(cfg),
		sesv1:   sesv1.NewFromConfig(cfg),
		sesv2:   sesv2.NewFromConfig(cfg),
		lambda:  lambda.NewFromConfig(cfg),
		iam:     iam.NewFromConfig(cfg),
		sqs:     sqs.NewFromConfig(cfg),
	}, nil
}

func errorCode(err error) string {
	var apiErr smithy.APIError
	if errors.As(err, &apiErr) {
		return apiErr.ErrorCode()
	}
	return ""
}

type Params struct {
	Domain        string
	Release       string
	CacheDir      string
	DatabaseURL   string
	DatabaseToken string
	APIToken      string
}

type Gateway struct {
	Endpoint string
	RuleSet  string
}

func (client *Client) ruleArn(set, rule string) string {
	return fmt.Sprintf("arn:aws:ses:%s:%s:receipt-rule-set/%s:receipt-rule/%s", client.Region, client.Account, set, rule)
}

func (client *Client) Identity(ctx context.Context, domain string) ([]cloudflare.Record, bool, error) {
	identity, err := client.sesv2.GetEmailIdentity(ctx, &sesv2.GetEmailIdentityInput{EmailIdentity: aws.String(domain)})
	if errorCode(err) == "NotFoundException" {
		if _, err := client.sesv2.CreateEmailIdentity(ctx, &sesv2.CreateEmailIdentityInput{EmailIdentity: aws.String(domain)}); err != nil {
			return nil, false, fmt.Errorf("creating the SES identity %s: %w", domain, err)
		}
		identity, err = client.sesv2.GetEmailIdentity(ctx, &sesv2.GetEmailIdentityInput{EmailIdentity: aws.String(domain)})
	}
	if err != nil {
		return nil, false, fmt.Errorf("reading the SES identity %s: %w", domain, err)
	}
	records := []cloudflare.Record{{Type: "MX", Name: domain, Value: "inbound-smtp." + client.Region + ".amazonaws.com", Priority: 10}}
	if identity.DkimAttributes != nil {
		for _, token := range identity.DkimAttributes.Tokens {
			records = append(records, cloudflare.Record{Type: "CNAME", Name: token + "._domainkey." + domain, Value: token + ".dkim.amazonses.com"})
		}
	}
	return records, identity.VerifiedForSendingStatus, nil
}

func (client *Client) WaitVerified(ctx context.Context, domain string, every, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	for {
		identity, err := client.sesv2.GetEmailIdentity(ctx, &sesv2.GetEmailIdentityInput{EmailIdentity: aws.String(domain)})
		if err != nil {
			return err
		}
		if identity.VerifiedForSendingStatus {
			return nil
		}
		if time.Now().After(deadline) {
			return fmt.Errorf("%s is %s", domain, strings.ToLower(string(identity.VerificationStatus)))
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(every):
		}
	}
}

func (client *Client) ProductionAccess(ctx context.Context) (bool, error) {
	account, err := client.sesv2.GetAccount(ctx, &sesv2.GetAccountInput{})
	if err != nil {
		return false, fmt.Errorf("reading the SES account: %w", err)
	}
	return account.ProductionAccessEnabled, nil
}

func (client *Client) RequestProductionAccess(ctx context.Context, website, contact string) error {
	input := &sesv2.PutAccountDetailsInput{
		MailType:                        sesv2types.MailTypeTransactional,
		WebsiteURL:                      aws.String(website),
		ContactLanguage:                 sesv2types.ContactLanguageEn,
		UseCaseDescription:              aws.String("Person-to-person email for the users of a self-hosted Metis Suite mail server: each user sends from their own address on this domain."),
		ProductionAccessEnabled:         aws.Bool(true),
		AdditionalContactEmailAddresses: []string{contact},
	}
	if contact == "" {
		input.AdditionalContactEmailAddresses = nil
	}
	_, err := client.sesv2.PutAccountDetails(ctx, input)
	return err
}

func policy(statements ...map[string]any) string {
	raw, _ := json.Marshal(map[string]any{"Version": "2012-10-17", "Statement": statements})
	return string(raw)
}

func (client *Client) bucket(ctx context.Context, name, rule string) error {
	input := &s3.CreateBucketInput{Bucket: aws.String(name)}
	if client.Region != "us-east-1" {
		input.CreateBucketConfiguration = &s3types.CreateBucketConfiguration{LocationConstraint: s3types.BucketLocationConstraint(client.Region)}
	}
	if _, err := client.s3.CreateBucket(ctx, input); err != nil {
		if code := errorCode(err); code != "BucketAlreadyOwnedByYou" {
			return fmt.Errorf("creating the bucket %s: %w", name, err)
		}
	}
	_, err := client.s3.PutBucketPolicy(ctx, &s3.PutBucketPolicyInput{
		Bucket: aws.String(name),
		Policy: aws.String(policy(map[string]any{
			"Sid":       "AllowSESPuts",
			"Effect":    "Allow",
			"Principal": map[string]string{"Service": "ses.amazonaws.com"},
			"Action":    "s3:PutObject",
			"Resource":  "arn:aws:s3:::" + name + "/*",
			"Condition": map[string]any{
				"StringEquals": map[string]string{"AWS:SourceAccount": client.Account},
				"ArnLike":      map[string]string{"AWS:SourceArn": client.ruleArn("*", rule)},
			},
		})),
	})
	if err != nil {
		return fmt.Errorf("setting the policy of %s: %w", name, err)
	}
	return nil
}

func (client *Client) queue(ctx context.Context, name string) (string, error) {
	created, err := client.sqs.CreateQueue(ctx, &sqs.CreateQueueInput{QueueName: aws.String(name)})
	if err != nil {
		return "", fmt.Errorf("creating the queue %s: %w", name, err)
	}
	attributes, err := client.sqs.GetQueueAttributes(ctx, &sqs.GetQueueAttributesInput{
		QueueUrl:       created.QueueUrl,
		AttributeNames: []sqstypes.QueueAttributeName{sqstypes.QueueAttributeNameQueueArn},
	})
	if err != nil {
		return "", fmt.Errorf("reading the queue %s: %w", name, err)
	}
	return attributes.Attributes[string(sqstypes.QueueAttributeNameQueueArn)], nil
}

func (client *Client) role(ctx context.Context, name, domain, bucket, queueArn string) (string, error) {
	trust := policy(map[string]any{
		"Effect":    "Allow",
		"Principal": map[string]string{"Service": "lambda.amazonaws.com"},
		"Action":    "sts:AssumeRole",
	})
	arn := ""
	created, err := client.iam.CreateRole(ctx, &iam.CreateRoleInput{RoleName: aws.String(name), AssumeRolePolicyDocument: aws.String(trust)})
	switch {
	case err == nil:
		arn = aws.ToString(created.Role.Arn)
	case errorCode(err) == "EntityAlreadyExists":
		existing, getErr := client.iam.GetRole(ctx, &iam.GetRoleInput{RoleName: aws.String(name)})
		if getErr != nil {
			return "", fmt.Errorf("reading the role %s: %w", name, getErr)
		}
		arn = aws.ToString(existing.Role.Arn)
	default:
		return "", fmt.Errorf("creating the role %s: %w", name, err)
	}
	document := policy(
		map[string]any{"Effect": "Allow", "Action": []string{"s3:GetObject", "s3:PutObject", "s3:DeleteObject"}, "Resource": "arn:aws:s3:::" + bucket + "/*"},
		map[string]any{"Effect": "Allow", "Action": "s3:ListBucket", "Resource": "arn:aws:s3:::" + bucket},
		map[string]any{
			"Effect": "Allow",
			"Action": []string{"ses:SendEmail", "ses:SendRawEmail"},
			"Resource": []string{
				fmt.Sprintf("arn:aws:ses:%s:%s:identity/%s", client.Region, client.Account, domain),
				fmt.Sprintf("arn:aws:ses:%s:%s:identity/*@%s", client.Region, client.Account, domain),
			},
			"Condition": map[string]any{"StringLike": map[string]string{"ses:FromAddress": "*@" + domain}},
		},
		map[string]any{"Effect": "Allow", "Action": "sqs:SendMessage", "Resource": queueArn},
		map[string]any{"Effect": "Allow", "Action": []string{"logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"}, "Resource": "*"},
	)
	if _, err := client.iam.PutRolePolicy(ctx, &iam.PutRolePolicyInput{RoleName: aws.String(name), PolicyName: aws.String("gateway"), PolicyDocument: aws.String(document)}); err != nil {
		return "", fmt.Errorf("setting the policy of %s: %w", name, err)
	}
	return arn, nil
}

func (client *Client) function(ctx context.Context, name, roleArn string, zip []byte, env map[string]string) (string, error) {
	variables := &lambdatypes.Environment{Variables: env}
	existing, err := client.lambda.GetFunction(ctx, &lambda.GetFunctionInput{FunctionName: aws.String(name)})
	if err == nil {
		if _, err := client.lambda.UpdateFunctionCode(ctx, &lambda.UpdateFunctionCodeInput{FunctionName: aws.String(name), ZipFile: zip}); err != nil {
			return "", fmt.Errorf("updating the code of %s: %w", name, err)
		}
		waiter := lambda.NewFunctionUpdatedV2Waiter(client.lambda)
		if err := waiter.Wait(ctx, &lambda.GetFunctionInput{FunctionName: aws.String(name)}, 2*time.Minute); err != nil {
			return "", err
		}
		if _, err := client.lambda.UpdateFunctionConfiguration(ctx, &lambda.UpdateFunctionConfigurationInput{
			FunctionName: aws.String(name), Environment: variables, Role: aws.String(roleArn),
			Timeout: aws.Int32(timeoutSeconds), MemorySize: aws.Int32(memoryMB),
		}); err != nil {
			return "", fmt.Errorf("updating the settings of %s: %w", name, err)
		}
		if err := waiter.Wait(ctx, &lambda.GetFunctionInput{FunctionName: aws.String(name)}, 2*time.Minute); err != nil {
			return "", err
		}
		return aws.ToString(existing.Configuration.FunctionArn), nil
	}
	if errorCode(err) != "ResourceNotFoundException" {
		return "", fmt.Errorf("reading the function %s: %w", name, err)
	}
	input := &lambda.CreateFunctionInput{
		FunctionName:  aws.String(name),
		Role:          aws.String(roleArn),
		Handler:       aws.String("index.handler"),
		Runtime:       lambdatypes.Runtime("nodejs24.x"),
		Architectures: []lambdatypes.Architecture{lambdatypes.ArchitectureArm64},
		Timeout:       aws.Int32(timeoutSeconds),
		MemorySize:    aws.Int32(memoryMB),
		Code:          &lambdatypes.FunctionCode{ZipFile: zip},
		Environment:   variables,
	}
	deadline := time.Now().Add(90 * time.Second)
	for {
		created, err := client.lambda.CreateFunction(ctx, input)
		if err == nil {
			waiter := lambda.NewFunctionActiveV2Waiter(client.lambda)
			if err := waiter.Wait(ctx, &lambda.GetFunctionInput{FunctionName: aws.String(name)}, 2*time.Minute); err != nil {
				return "", err
			}
			return aws.ToString(created.FunctionArn), nil
		}
		if errorCode(err) != "InvalidParameterValueException" || time.Now().After(deadline) {
			return "", fmt.Errorf("creating the function %s: %w", name, err)
		}
		select {
		case <-ctx.Done():
			return "", ctx.Err()
		case <-time.After(5 * time.Second):
		}
	}
}

func ignoreConflict(err error) error {
	if code := errorCode(err); code == "ResourceConflictException" {
		return nil
	}
	return err
}

func (client *Client) functionURL(ctx context.Context, name string) (string, error) {
	existing, err := client.lambda.GetFunctionUrlConfig(ctx, &lambda.GetFunctionUrlConfigInput{FunctionName: aws.String(name)})
	url := ""
	if err == nil {
		url = aws.ToString(existing.FunctionUrl)
	} else if errorCode(err) == "ResourceNotFoundException" {
		created, err := client.lambda.CreateFunctionUrlConfig(ctx, &lambda.CreateFunctionUrlConfigInput{
			FunctionName: aws.String(name),
			AuthType:     lambdatypes.FunctionUrlAuthTypeNone,
			InvokeMode:   lambdatypes.InvokeModeResponseStream,
		})
		if err != nil {
			return "", fmt.Errorf("creating the function URL of %s: %w", name, err)
		}
		url = aws.ToString(created.FunctionUrl)
	} else {
		return "", fmt.Errorf("reading the function URL of %s: %w", name, err)
	}
	if _, err := client.lambda.AddPermission(ctx, &lambda.AddPermissionInput{
		FunctionName: aws.String(name), StatementId: aws.String("function-url-public"),
		Action: aws.String("lambda:InvokeFunctionUrl"), Principal: aws.String("*"),
		FunctionUrlAuthType: lambdatypes.FunctionUrlAuthTypeNone,
	}); ignoreConflict(err) != nil {
		return "", fmt.Errorf("opening the function URL of %s: %w", name, err)
	}
	if _, err := client.lambda.AddPermission(ctx, &lambda.AddPermissionInput{
		FunctionName: aws.String(name), StatementId: aws.String("function-url-invoke"),
		Action: aws.String("lambda:InvokeFunction"), Principal: aws.String("*"),
		InvokedViaFunctionUrl: aws.Bool(true),
	}); ignoreConflict(err) != nil {
		return "", fmt.Errorf("opening the function URL of %s: %w", name, err)
	}
	return strings.TrimRight(url, "/"), nil
}

func (client *Client) activeRuleSet(ctx context.Context) (string, []sestypes.ReceiptRule, error) {
	active, err := client.sesv1.DescribeActiveReceiptRuleSet(ctx, &sesv1.DescribeActiveReceiptRuleSetInput{})
	if err != nil {
		return "", nil, fmt.Errorf("reading the active SES rule set: %w", err)
	}
	if active.Metadata == nil {
		return "", nil, nil
	}
	return aws.ToString(active.Metadata.Name), active.Rules, nil
}

func (client *Client) Deploy(ctx context.Context, params Params, progress func(string)) (Gateway, error) {
	domain := gateways.NormalizeDomain(params.Domain)
	name := ResourceName(domain)
	active, rules, err := client.activeRuleSet(ctx)
	if err != nil {
		return Gateway{}, err
	}
	set := active
	if set == "" {
		set = DefaultRuleSet
	}
	if err := client.bucket(ctx, name, name); err != nil {
		return Gateway{}, err
	}
	progress("S3 bucket " + name)
	queueArn, err := client.queue(ctx, name+"-failed")
	if err != nil {
		return Gateway{}, err
	}
	roleArn, err := client.role(ctx, name, domain, name, queueArn)
	if err != nil {
		return Gateway{}, err
	}
	progress("IAM role " + name)
	zip, err := gateways.Artifact(ctx, gateways.SES, params.Release, "gateway-ses.zip", params.CacheDir)
	if err != nil {
		return Gateway{}, err
	}
	functionArn, err := client.function(ctx, name, roleArn, zip, map[string]string{
		"MAIL_DOMAIN":         domain,
		"API_TOKEN":           params.APIToken,
		"DATABASE_URL":        params.DatabaseURL,
		"DATABASE_AUTH_TOKEN": params.DatabaseToken,
		"MAIL_BUCKET":         name,
	})
	if err != nil {
		return Gateway{}, err
	}
	progress("Lambda function " + name + " (" + params.Release + ")")
	endpoint, err := client.functionURL(ctx, name)
	if err != nil {
		return Gateway{}, err
	}
	if _, err := client.lambda.AddPermission(ctx, &lambda.AddPermissionInput{
		FunctionName: aws.String(name), StatementId: aws.String("ses-receipt"),
		Action: aws.String("lambda:InvokeFunction"), Principal: aws.String("ses.amazonaws.com"),
		SourceAccount: aws.String(client.Account), SourceArn: aws.String(client.ruleArn(set, name)),
	}); ignoreConflict(err) != nil {
		return Gateway{}, fmt.Errorf("letting SES invoke %s: %w", name, err)
	}
	if _, err := client.lambda.PutFunctionEventInvokeConfig(ctx, &lambda.PutFunctionEventInvokeConfigInput{
		FunctionName:             aws.String(name),
		MaximumRetryAttempts:     aws.Int32(2),
		MaximumEventAgeInSeconds: aws.Int32(21600),
		DestinationConfig:        &lambdatypes.DestinationConfig{OnFailure: &lambdatypes.OnFailure{Destination: aws.String(queueArn)}},
	}); err != nil {
		return Gateway{}, fmt.Errorf("setting the retries of %s: %w", name, err)
	}
	progress("Function URL " + endpoint)

	if active == "" {
		if _, err := client.sesv1.CreateReceiptRuleSet(ctx, &sesv1.CreateReceiptRuleSetInput{RuleSetName: aws.String(set)}); err != nil && errorCode(err) != "AlreadyExists" {
			return Gateway{}, fmt.Errorf("creating the rule set %s: %w", set, err)
		}
		if _, err := client.sesv1.SetActiveReceiptRuleSet(ctx, &sesv1.SetActiveReceiptRuleSetInput{RuleSetName: aws.String(set)}); err != nil {
			return Gateway{}, fmt.Errorf("activating the rule set %s: %w", set, err)
		}
		progress("Created and activated the rule set " + set)
	}
	rule := &sestypes.ReceiptRule{
		Name:        aws.String(name),
		Enabled:     true,
		ScanEnabled: true,
		TlsPolicy:   sestypes.TlsPolicyOptional,
		Recipients:  []string{domain},
		Actions: []sestypes.ReceiptAction{
			{S3Action: &sestypes.S3Action{BucketName: aws.String(name)}},
			{LambdaAction: &sestypes.LambdaAction{FunctionArn: aws.String(functionArn), InvocationType: sestypes.InvocationTypeEvent}},
		},
	}
	exists := slices.ContainsFunc(rules, func(existing sestypes.ReceiptRule) bool { return aws.ToString(existing.Name) == name })
	if exists {
		_, err = client.sesv1.UpdateReceiptRule(ctx, &sesv1.UpdateReceiptRuleInput{RuleSetName: aws.String(set), Rule: rule})
	} else {
		_, err = client.sesv1.CreateReceiptRule(ctx, &sesv1.CreateReceiptRuleInput{RuleSetName: aws.String(set), Rule: rule})
	}
	if err != nil {
		return Gateway{}, fmt.Errorf("adding the receipt rule %s to %s: %w", name, set, err)
	}
	progress("Receipt rule " + name + " in " + set)
	return Gateway{Endpoint: endpoint, RuleSet: set}, nil
}

func (client *Client) FailedReceipts(ctx context.Context, domain string) (int, error) {
	name := ResourceName(domain) + "-failed"
	url, err := client.sqs.GetQueueUrl(ctx, &sqs.GetQueueUrlInput{QueueName: aws.String(name)})
	if err != nil {
		return 0, err
	}
	attributes, err := client.sqs.GetQueueAttributes(ctx, &sqs.GetQueueAttributesInput{
		QueueUrl:       url.QueueUrl,
		AttributeNames: []sqstypes.QueueAttributeName{sqstypes.QueueAttributeNameApproximateNumberOfMessages},
	})
	if err != nil {
		return 0, err
	}
	return strconv.Atoi(attributes.Attributes[string(sqstypes.QueueAttributeNameApproximateNumberOfMessages)])
}

func notFound(err error) bool {
	switch errorCode(err) {
	case "ResourceNotFoundException", "NoSuchEntity", "RuleDoesNotExist", "AWS.SimpleQueueService.NonExistentQueue", "QueueDoesNotExist", "NoSuchBucket":
		return true
	}
	return false
}

func (client *Client) Remove(ctx context.Context, domain string, purge bool, progress func(string)) error {
	domain = gateways.NormalizeDomain(domain)
	name := ResourceName(domain)
	set, rules, err := client.activeRuleSet(ctx)
	if err != nil {
		return err
	}
	if slices.ContainsFunc(rules, func(rule sestypes.ReceiptRule) bool { return aws.ToString(rule.Name) == name }) {
		if _, err := client.sesv1.DeleteReceiptRule(ctx, &sesv1.DeleteReceiptRuleInput{RuleSetName: aws.String(set), RuleName: aws.String(name)}); err != nil {
			return fmt.Errorf("deleting the receipt rule %s: %w", name, err)
		}
		progress("Deleted the receipt rule " + name + " from " + set)
	}
	if _, err := client.lambda.DeleteFunctionUrlConfig(ctx, &lambda.DeleteFunctionUrlConfigInput{FunctionName: aws.String(name)}); err != nil && !notFound(err) {
		return fmt.Errorf("deleting the function URL of %s: %w", name, err)
	}
	if _, err := client.lambda.DeleteFunction(ctx, &lambda.DeleteFunctionInput{FunctionName: aws.String(name)}); err != nil && !notFound(err) {
		return fmt.Errorf("deleting the function %s: %w", name, err)
	}
	progress("Deleted the function " + name)
	if url, err := client.sqs.GetQueueUrl(ctx, &sqs.GetQueueUrlInput{QueueName: aws.String(name + "-failed")}); err == nil {
		if _, err := client.sqs.DeleteQueue(ctx, &sqs.DeleteQueueInput{QueueUrl: url.QueueUrl}); err != nil {
			return fmt.Errorf("deleting the queue %s-failed: %w", name, err)
		}
	} else if !notFound(err) {
		return fmt.Errorf("reading the queue %s-failed: %w", name, err)
	}
	if _, err := client.iam.DeleteRolePolicy(ctx, &iam.DeleteRolePolicyInput{RoleName: aws.String(name), PolicyName: aws.String("gateway")}); err != nil && !notFound(err) {
		return fmt.Errorf("deleting the policy of %s: %w", name, err)
	}
	if _, err := client.iam.DeleteRole(ctx, &iam.DeleteRoleInput{RoleName: aws.String(name)}); err != nil && !notFound(err) {
		return fmt.Errorf("deleting the role %s: %w", name, err)
	}
	progress("Deleted the queue and the role")
	if !purge {
		return nil
	}
	paginator := s3.NewListObjectsV2Paginator(client.s3, &s3.ListObjectsV2Input{Bucket: aws.String(name)})
	for paginator.HasMorePages() {
		page, err := paginator.NextPage(ctx)
		if notFound(err) {
			return nil
		}
		if err != nil {
			return fmt.Errorf("listing %s: %w", name, err)
		}
		if len(page.Contents) == 0 {
			continue
		}
		objects := make([]s3types.ObjectIdentifier, 0, len(page.Contents))
		for _, object := range page.Contents {
			objects = append(objects, s3types.ObjectIdentifier{Key: object.Key})
		}
		if _, err := client.s3.DeleteObjects(ctx, &s3.DeleteObjectsInput{Bucket: aws.String(name), Delete: &s3types.Delete{Objects: objects, Quiet: aws.Bool(true)}}); err != nil {
			return fmt.Errorf("emptying %s: %w", name, err)
		}
	}
	if _, err := client.s3.DeleteBucket(ctx, &s3.DeleteBucketInput{Bucket: aws.String(name)}); err != nil && !notFound(err) {
		return fmt.Errorf("deleting the bucket %s: %w", name, err)
	}
	progress("Deleted the bucket " + name)
	return nil
}
