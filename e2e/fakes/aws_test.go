package main

import (
	"archive/zip"
	"bytes"
	"context"
	"crypto/tls"
	"errors"
	"net"
	"net/http"
	"net/http/httptest"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/iam"
	"github.com/aws/aws-sdk-go-v2/service/lambda"
	lambdatypes "github.com/aws/aws-sdk-go-v2/service/lambda/types"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	sesv1 "github.com/aws/aws-sdk-go-v2/service/ses"
	sestypes "github.com/aws/aws-sdk-go-v2/service/ses/types"
	"github.com/aws/aws-sdk-go-v2/service/sesv2"
	"github.com/aws/aws-sdk-go-v2/service/sqs"
	sqstypes "github.com/aws/aws-sdk-go-v2/service/sqs/types"
	"github.com/aws/aws-sdk-go-v2/service/sts"
	"github.com/aws/smithy-go"
)

func redirectingClient(server *httptest.Server) *http.Client {
	addr := server.Listener.Addr().String()
	return &http.Client{
		Timeout: 30 * time.Second,
		Transport: &http.Transport{
			DialContext: func(ctx context.Context, network, _ string) (net.Conn, error) {
				return (&net.Dialer{}).DialContext(ctx, network, addr)
			},
			TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
		},
	}
}

func code(err error) string {
	var apiErr smithy.APIError
	if errors.As(err, &apiErr) {
		return apiErr.ErrorCode()
	}
	return ""
}

func gatewayZip(t *testing.T) []byte {
	t.Helper()
	var buf bytes.Buffer
	writer := zip.NewWriter(&buf)
	file, err := writer.Create("index.mjs")
	if err != nil {
		t.Fatal(err)
	}
	_, _ = file.Write([]byte("export const handler = () => {};\n"))
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}

func TestTheSESFakeAnswersTheGatewayDeployAndRemoveTheCLIRuns(t *testing.T) {
	fake := &sesFake{domain: "team.demo.trymetis.email", region: "us-east-1", accessKey: "e2e-access-key", aws: newAWSState("us-east-1")}
	server := httptest.NewTLSServer(http.HandlerFunc(fake.endpoints))
	defer server.Close()
	cfg := aws.Config{
		Region:      "us-east-1",
		Credentials: credentials.NewStaticCredentialsProvider("e2e-access-key", "e2e-secret-key-0001", ""),
		HTTPClient:  redirectingClient(server),
	}
	ctx := context.Background()
	const domain = "aws.demo.trymetis.email"
	const name = "metis-ses-aws-demo-trymetis-email"

	identity, err := sts.NewFromConfig(cfg).GetCallerIdentity(ctx, &sts.GetCallerIdentityInput{})
	if err != nil || aws.ToString(identity.Account) != awsAccount {
		t.Fatalf("GetCallerIdentity: %v %v", identity, err)
	}

	v2 := sesv2.NewFromConfig(cfg)
	if _, err := v2.GetEmailIdentity(ctx, &sesv2.GetEmailIdentityInput{EmailIdentity: aws.String(domain)}); code(err) != "NotFoundException" {
		t.Fatalf("GetEmailIdentity before create: %v", err)
	}
	if _, err := v2.CreateEmailIdentity(ctx, &sesv2.CreateEmailIdentityInput{EmailIdentity: aws.String(domain)}); err != nil {
		t.Fatal(err)
	}
	got, err := v2.GetEmailIdentity(ctx, &sesv2.GetEmailIdentityInput{EmailIdentity: aws.String(domain)})
	if err != nil || !got.VerifiedForSendingStatus || len(got.DkimAttributes.Tokens) != 3 {
		t.Fatalf("GetEmailIdentity: %+v %v", got, err)
	}
	account, err := v2.GetAccount(ctx, &sesv2.GetAccountInput{})
	if err != nil || !account.ProductionAccessEnabled {
		t.Fatalf("GetAccount: %+v %v", account, err)
	}

	v1 := sesv1.NewFromConfig(cfg)
	active, err := v1.DescribeActiveReceiptRuleSet(ctx, &sesv1.DescribeActiveReceiptRuleSetInput{})
	if err != nil || active.Metadata != nil {
		t.Fatalf("DescribeActiveReceiptRuleSet before: %+v %v", active, err)
	}

	bucket := s3.NewFromConfig(cfg)
	if _, err := bucket.CreateBucket(ctx, &s3.CreateBucketInput{Bucket: aws.String(name)}); err != nil {
		t.Fatal(err)
	}
	if _, err := bucket.CreateBucket(ctx, &s3.CreateBucketInput{Bucket: aws.String(name)}); code(err) != "BucketAlreadyOwnedByYou" {
		t.Fatalf("second CreateBucket: %v", err)
	}
	if _, err := bucket.PutBucketPolicy(ctx, &s3.PutBucketPolicyInput{Bucket: aws.String(name), Policy: aws.String(`{"Version":"2012-10-17","Statement":[]}`)}); err != nil {
		t.Fatal(err)
	}

	queues := sqs.NewFromConfig(cfg)
	created, err := queues.CreateQueue(ctx, &sqs.CreateQueueInput{QueueName: aws.String(name + "-failed")})
	if err != nil {
		t.Fatal(err)
	}
	attributes, err := queues.GetQueueAttributes(ctx, &sqs.GetQueueAttributesInput{
		QueueUrl: created.QueueUrl, AttributeNames: []sqstypes.QueueAttributeName{sqstypes.QueueAttributeNameQueueArn},
	})
	if err != nil || !strings.HasSuffix(attributes.Attributes["QueueArn"], ":"+name+"-failed") {
		t.Fatalf("GetQueueAttributes: %+v %v", attributes, err)
	}

	roles := iam.NewFromConfig(cfg)
	role, err := roles.CreateRole(ctx, &iam.CreateRoleInput{RoleName: aws.String(name), AssumeRolePolicyDocument: aws.String("{}")})
	if err != nil || !strings.HasSuffix(aws.ToString(role.Role.Arn), ":role/"+name) {
		t.Fatalf("CreateRole: %v", err)
	}
	if _, err := roles.CreateRole(ctx, &iam.CreateRoleInput{RoleName: aws.String(name), AssumeRolePolicyDocument: aws.String("{}")}); code(err) != "EntityAlreadyExists" {
		t.Fatalf("second CreateRole: %v", err)
	}
	if _, err := roles.GetRole(ctx, &iam.GetRoleInput{RoleName: aws.String(name)}); err != nil {
		t.Fatal(err)
	}
	if _, err := roles.PutRolePolicy(ctx, &iam.PutRolePolicyInput{RoleName: aws.String(name), PolicyName: aws.String("gateway"), PolicyDocument: aws.String("{}")}); err != nil {
		t.Fatal(err)
	}

	functions := lambda.NewFromConfig(cfg)
	if _, err := functions.GetFunction(ctx, &lambda.GetFunctionInput{FunctionName: aws.String(name)}); code(err) != "ResourceNotFoundException" {
		t.Fatalf("GetFunction before create: %v", err)
	}
	fn, err := functions.CreateFunction(ctx, &lambda.CreateFunctionInput{
		FunctionName: aws.String(name), Role: role.Role.Arn, Handler: aws.String("index.handler"),
		Runtime: lambdatypes.Runtime("nodejs24.x"), Architectures: []lambdatypes.Architecture{lambdatypes.ArchitectureArm64},
		Code:        &lambdatypes.FunctionCode{ZipFile: gatewayZip(t)},
		Environment: &lambdatypes.Environment{Variables: map[string]string{"MAIL_DOMAIN": domain, "API_TOKEN": "x"}},
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := lambda.NewFunctionActiveV2Waiter(functions).Wait(ctx, &lambda.GetFunctionInput{FunctionName: aws.String(name)}, time.Minute); err != nil {
		t.Fatal(err)
	}
	if _, err := functions.GetFunctionUrlConfig(ctx, &lambda.GetFunctionUrlConfigInput{FunctionName: aws.String(name)}); code(err) != "ResourceNotFoundException" {
		t.Fatalf("GetFunctionUrlConfig before create: %v", err)
	}
	url, err := functions.CreateFunctionUrlConfig(ctx, &lambda.CreateFunctionUrlConfigInput{
		FunctionName: aws.String(name), AuthType: lambdatypes.FunctionUrlAuthTypeNone, InvokeMode: lambdatypes.InvokeModeResponseStream,
	})
	if err != nil || !strings.HasPrefix(aws.ToString(url.FunctionUrl), "https://") {
		t.Fatalf("CreateFunctionUrlConfig: %v", err)
	}
	permission := &lambda.AddPermissionInput{
		FunctionName: aws.String(name), StatementId: aws.String("function-url-public"),
		Action: aws.String("lambda:InvokeFunctionUrl"), Principal: aws.String("*"), FunctionUrlAuthType: lambdatypes.FunctionUrlAuthTypeNone,
	}
	if _, err := functions.AddPermission(ctx, permission); err != nil {
		t.Fatal(err)
	}
	if _, err := functions.AddPermission(ctx, permission); code(err) != "ResourceConflictException" {
		t.Fatalf("second AddPermission: %v", err)
	}
	if _, err := functions.PutFunctionEventInvokeConfig(ctx, &lambda.PutFunctionEventInvokeConfigInput{
		FunctionName: aws.String(name), MaximumRetryAttempts: aws.Int32(2),
	}); err != nil {
		t.Fatal(err)
	}

	if _, err := v1.CreateReceiptRuleSet(ctx, &sesv1.CreateReceiptRuleSetInput{RuleSetName: aws.String("metis")}); err != nil {
		t.Fatal(err)
	}
	if _, err := v1.SetActiveReceiptRuleSet(ctx, &sesv1.SetActiveReceiptRuleSetInput{RuleSetName: aws.String("metis")}); err != nil {
		t.Fatal(err)
	}
	if _, err := v1.CreateReceiptRule(ctx, &sesv1.CreateReceiptRuleInput{RuleSetName: aws.String("metis"), Rule: &sestypes.ReceiptRule{
		Name: aws.String(name), Enabled: true, Recipients: []string{domain},
		Actions: []sestypes.ReceiptAction{
			{S3Action: &sestypes.S3Action{BucketName: aws.String(name)}},
			{LambdaAction: &sestypes.LambdaAction{FunctionArn: fn.FunctionArn}},
		},
	}}); err != nil {
		t.Fatal(err)
	}
	active, err = v1.DescribeActiveReceiptRuleSet(ctx, &sesv1.DescribeActiveReceiptRuleSetInput{})
	if err != nil || aws.ToString(active.Metadata.Name) != "metis" || len(active.Rules) != 1 || aws.ToString(active.Rules[0].Name) != name {
		t.Fatalf("DescribeActiveReceiptRuleSet after: %+v %v", active, err)
	}

	if _, err := v1.DeleteReceiptRule(ctx, &sesv1.DeleteReceiptRuleInput{RuleSetName: aws.String("metis"), RuleName: aws.String(name)}); err != nil {
		t.Fatal(err)
	}
	if _, err := functions.DeleteFunctionUrlConfig(ctx, &lambda.DeleteFunctionUrlConfigInput{FunctionName: aws.String(name)}); err != nil {
		t.Fatal(err)
	}
	if _, err := functions.DeleteFunction(ctx, &lambda.DeleteFunctionInput{FunctionName: aws.String(name)}); err != nil {
		t.Fatal(err)
	}
	queueURL, err := queues.GetQueueUrl(ctx, &sqs.GetQueueUrlInput{QueueName: aws.String(name + "-failed")})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := queues.DeleteQueue(ctx, &sqs.DeleteQueueInput{QueueUrl: queueURL.QueueUrl}); err != nil {
		t.Fatal(err)
	}
	if _, err := queues.GetQueueUrl(ctx, &sqs.GetQueueUrlInput{QueueName: aws.String(name + "-failed")}); !slices.Contains([]string{"QueueDoesNotExist", "AWS.SimpleQueueService.NonExistentQueue"}, code(err)) {
		t.Fatalf("GetQueueUrl after delete: %v (%q)", err, code(err))
	}
	if _, err := roles.DeleteRolePolicy(ctx, &iam.DeleteRolePolicyInput{RoleName: aws.String(name), PolicyName: aws.String("gateway")}); err != nil {
		t.Fatal(err)
	}
	if _, err := roles.DeleteRole(ctx, &iam.DeleteRoleInput{RoleName: aws.String(name)}); err != nil {
		t.Fatal(err)
	}
	if _, err := roles.DeleteRole(ctx, &iam.DeleteRoleInput{RoleName: aws.String(name)}); code(err) != "NoSuchEntity" {
		t.Fatalf("second DeleteRole: %v", err)
	}
	listed, err := bucket.ListObjectsV2(ctx, &s3.ListObjectsV2Input{Bucket: aws.String(name)})
	if err != nil || len(listed.Contents) != 0 {
		t.Fatalf("ListObjectsV2: %+v %v", listed, err)
	}
	if _, err := bucket.DeleteBucket(ctx, &s3.DeleteBucketInput{Bucket: aws.String(name)}); err != nil {
		t.Fatal(err)
	}
	if _, err := bucket.ListObjectsV2(ctx, &s3.ListObjectsV2Input{Bucket: aws.String(name)}); code(err) != "NoSuchBucket" {
		t.Fatalf("ListObjectsV2 after delete: %v", err)
	}

	fake.aws.calls.mu.Lock()
	recorded := len(fake.aws.calls.calls)
	fake.aws.calls.mu.Unlock()
	if recorded < 20 {
		t.Fatalf("only %d calls were recorded", recorded)
	}
}

func TestTheSESFakeRefusesUnsignedCalls(t *testing.T) {
	fake := &sesFake{accessKey: "e2e-access-key", aws: newAWSState("us-east-1")}
	server := httptest.NewTLSServer(http.HandlerFunc(fake.endpoints))
	defer server.Close()
	cfg := aws.Config{
		Region:      "us-east-1",
		Credentials: credentials.NewStaticCredentialsProvider("someone-else", "secret", ""),
		HTTPClient:  redirectingClient(server),
	}
	if _, err := sts.NewFromConfig(cfg).GetCallerIdentity(context.Background(), &sts.GetCallerIdentityInput{}); err == nil {
		t.Fatal("a call signed with another key was answered")
	}
}
