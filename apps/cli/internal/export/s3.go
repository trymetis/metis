package export

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"net/url"
	"os"
	"path"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/s3/types"
)

var (
	singleUploadMax int64 = 64 << 20
	partSize              = 16 << 20
)

type S3Target struct {
	Bucket   string
	Prefix   string
	Endpoint string
	Region   string
}

func ParseS3(raw string) (*S3Target, error) {
	if !strings.HasPrefix(raw, "s3://") {
		return nil, nil
	}
	parsed, err := url.Parse(raw)
	if err != nil || parsed.Host == "" {
		return nil, fmt.Errorf("%q is not an s3://bucket/prefix address", raw)
	}
	prefix := strings.Trim(parsed.Path, "/")
	if prefix != "" {
		prefix += "/"
	}
	return &S3Target{Bucket: parsed.Host, Prefix: prefix}, nil
}

func (target S3Target) Key(name string) string {
	return target.Prefix + name
}

func (target S3Target) URL(name string) string {
	return "s3://" + target.Bucket + "/" + target.Key(name)
}

func (target S3Target) client(ctx context.Context) (*s3.Client, error) {
	var options []func(*config.LoadOptions) error
	if target.Region != "" {
		options = append(options, config.WithRegion(target.Region))
	}
	cfg, err := config.LoadDefaultConfig(ctx, options...)
	if err != nil {
		return nil, fmt.Errorf("loading AWS credentials: %w", err)
	}
	if cfg.Region == "" {
		cfg.Region = "us-east-1"
	}
	return s3.NewFromConfig(cfg, func(o *s3.Options) {
		if target.Endpoint != "" {
			o.BaseEndpoint = aws.String(target.Endpoint)
			o.UsePathStyle = true
			o.RequestChecksumCalculation = aws.RequestChecksumCalculationWhenRequired
			o.ResponseChecksumValidation = aws.ResponseChecksumValidationWhenRequired
		}
	}), nil
}

func Upload(ctx context.Context, target S3Target, file string, sha256 string) (string, error) {
	client, err := target.client(ctx)
	if err != nil {
		return "", err
	}
	info, err := os.Stat(file)
	if err != nil {
		return "", err
	}
	name := path.Base(file)
	key := target.Key(name)
	metadata := map[string]string{"sha256": sha256}
	if info.Size() <= singleUploadMax {
		in, err := os.Open(file)
		if err != nil {
			return "", err
		}
		defer in.Close()
		if _, err := client.PutObject(ctx, &s3.PutObjectInput{
			Bucket: aws.String(target.Bucket), Key: aws.String(key), Body: in,
			ContentLength: aws.Int64(info.Size()), ContentType: aws.String("application/x-tar"), Metadata: metadata,
		}); err != nil {
			return "", fmt.Errorf("uploading to %s: %w", target.URL(name), err)
		}
	} else if err := multipart(ctx, client, target, key, file, metadata); err != nil {
		return "", fmt.Errorf("uploading to %s: %w", target.URL(name), err)
	}
	head, err := client.HeadObject(ctx, &s3.HeadObjectInput{Bucket: aws.String(target.Bucket), Key: aws.String(key)})
	if err != nil {
		return "", fmt.Errorf("checking %s after the upload: %w", target.URL(name), err)
	}
	if head.ContentLength == nil || *head.ContentLength != info.Size() {
		return "", fmt.Errorf("%s holds a different size than the archive after the upload", target.URL(name))
	}
	return target.URL(name), nil
}

func multipart(ctx context.Context, client *s3.Client, target S3Target, key, file string, metadata map[string]string) (err error) {
	created, err := client.CreateMultipartUpload(ctx, &s3.CreateMultipartUploadInput{
		Bucket: aws.String(target.Bucket), Key: aws.String(key),
		ContentType: aws.String("application/x-tar"), Metadata: metadata,
	})
	if err != nil {
		return err
	}
	defer func() {
		if err != nil {
			_, _ = client.AbortMultipartUpload(context.WithoutCancel(ctx), &s3.AbortMultipartUploadInput{
				Bucket: aws.String(target.Bucket), Key: aws.String(key), UploadId: created.UploadId,
			})
		}
	}()
	in, err := os.Open(file)
	if err != nil {
		return err
	}
	defer in.Close()
	var parts []types.CompletedPart
	buffer := make([]byte, partSize)
	for number := int32(1); ; number++ {
		n, readErr := io.ReadFull(in, buffer)
		if n > 0 {
			part, err := client.UploadPart(ctx, &s3.UploadPartInput{
				Bucket: aws.String(target.Bucket), Key: aws.String(key), UploadId: created.UploadId,
				PartNumber: aws.Int32(number), Body: bytes.NewReader(buffer[:n]), ContentLength: aws.Int64(int64(n)),
			})
			if err != nil {
				return fmt.Errorf("part %d: %w", number, err)
			}
			parts = append(parts, types.CompletedPart{ETag: part.ETag, PartNumber: aws.Int32(number)})
		}
		if errors.Is(readErr, io.EOF) || errors.Is(readErr, io.ErrUnexpectedEOF) {
			break
		}
		if readErr != nil {
			return readErr
		}
	}
	_, err = client.CompleteMultipartUpload(ctx, &s3.CompleteMultipartUploadInput{
		Bucket: aws.String(target.Bucket), Key: aws.String(key), UploadId: created.UploadId,
		MultipartUpload: &types.CompletedMultipartUpload{Parts: parts},
	})
	return err
}
