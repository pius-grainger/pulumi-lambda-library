import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as path from "path";
import * as fs from "fs";

export interface LambdaTrigger {
    type: "apigateway" | "sns";
}

export interface LambdaConfig {
    name: string;
    handlerFileName: string;
    runtime: aws.lambda.Runtime;
    triggers: LambdaTrigger[];
    s3Bucket: string;
}

export function createLambdaRole(name: string): aws.iam.Role {
    const lambdaRole = new aws.iam.Role(`${name}-role`, {
        assumeRolePolicy: {
            Version: "2012-10-17",
            Statement: [
                {
                    Action: "sts:AssumeRole",
                    Principal: {
                        Service: "lambda.amazonaws.com",
                    },
                    Effect: "Allow",
                    Sid: "",
                },
            ],
        },
    });

    new aws.iam.RolePolicyAttachment(`${name}-policy`, {
        role: lambdaRole,
        policyArn: aws.iam.ManagedPolicies.AWSLambdaBasicExecutionRole,
    });

    return lambdaRole;
}

export function uploadLambdaCodeToS3(bucketName: string, handlerFileName: string): aws.s3.BucketObject {
    const artifactPath = path.resolve(__dirname, "../dist", `${handlerFileName}.zip`);
    if (!fs.existsSync(artifactPath)) {
        throw new Error(`Artifact ${artifactPath} not found. Please build the project first.`);
    }

    const bucket = new aws.s3.Bucket(bucketName);

    return new aws.s3.BucketObject(`${handlerFileName}.zip`, {
        bucket: bucket,
        source: new pulumi.asset.FileAsset(artifactPath),
    });
}

export function createLambda(config: LambdaConfig): aws.lambda.Function[] {
    const lambdaRole = createLambdaRole(config.name);
    const lambdas: aws.lambda.Function[] = [];

    const bucket = new aws.s3.Bucket(config.s3Bucket);

    config.triggers.forEach(trigger => {
        const s3Object = uploadLambdaCodeToS3(config.s3Bucket, config.handlerFileName);

        const lambda = new aws.lambda.Function(`${config.name}-${trigger.type}`, {
            s3Bucket: bucket.bucket,
            s3Key: s3Object.key,
            role: lambdaRole.arn,
            handler: "index.handler",
            runtime: config.runtime,
        });

        if (trigger.type === "apigateway") {
            const api = new aws.apigatewayv2.Api(`${config.name}-api`, {
                protocolType: "HTTP",
            });

            const integration = new aws.apigatewayv2.Integration(`${config.name}-integration`, {
                apiId: api.id,
                integrationType: "AWS_PROXY",
                integrationUri: lambda.arn,
                payloadFormatVersion: "2.0",
            });

            new aws.apigatewayv2.Route(`${config.name}-route`, {
                apiId: api.id,
                routeKey: "$default",
                target: pulumi.interpolate`integrations/${integration.id}`,
            });

            new aws.lambda.Permission(`${config.name}-apiPermission`, {
                action: "lambda:InvokeFunction",
                function: lambda,
                principal: "apigateway.amazonaws.com",
                sourceArn: pulumi.interpolate`${api.executionArn}/*/*`,
            });

        } else if (trigger.type === "sns") {
            const topic = new aws.sns.Topic(`${config.name}-topic`);

            new aws.sns.TopicSubscription(`${config.name}-subscription`, {
                topic: topic,
                protocol: "lambda",
                endpoint: lambda.arn,
            });

            new aws.lambda.Permission(`${config.name}-snsPermission`, {
                action: "lambda:InvokeFunction",
                function: lambda,
                principal: "sns.amazonaws.com",
                sourceArn: topic.arn,
            });
        }

        lambdas.push(lambda);
    });

    return lambdas;
}

export function createLambdaFromS3(name: string, s3BucketName: string, s3Key: string, handler: string, runtime: aws.lambda.Runtime): aws.lambda.Function {
    const lambdaRole = createLambdaRole(name);

    return new aws.lambda.Function(name, {
        s3Bucket: s3BucketName,
        s3Key: s3Key,
        role: lambdaRole.arn,
        handler: handler,
        runtime: runtime,
    });
}

