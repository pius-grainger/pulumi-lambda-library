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
    s3Bucket: aws.s3.Bucket; // Reference to the existing S3 bucket
    artifactPath: string; // Path to the ZIP artifact
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

export function uploadLambdaCodeToS3(bucket: aws.s3.Bucket, handlerFileName: string, artifactPath: string): aws.s3.BucketObject {
    if (!fs.existsSync(artifactPath)) {
        throw new Error(`Artifact ${artifactPath} not found. Please build the project first.`);
    }

    return new aws.s3.BucketObject(`${handlerFileName}.zip`, {
        bucket: bucket,
        source: new pulumi.asset.FileAsset(artifactPath),
    });
}

export function createLambda(config: LambdaConfig): aws.lambda.Function[] {
    const lambdaRole = createLambdaRole(config.name);
    const lambdas: aws.lambda.Function[] = [];

    config.triggers.forEach(trigger => {
        const s3Object = uploadLambdaCodeToS3(config.s3Bucket, config.handlerFileName, config.artifactPath);

        const lambda = new aws.lambda.Function(`${config.name}-${trigger.type}`, {
            s3Bucket: config.s3Bucket.bucket,
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

            api.id.apply(id => pulumi.log.info(`API ID: ${id}`));
            api.executionArn.apply(endpoint => pulumi.log.info(`API Execution ARN: ${endpoint}`));
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

            topic.arn.apply(arn => pulumi.log.info(`SNS Topic ARN: ${arn}`));
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

export interface ApiGatewayConfig {
    apiName: string;
    lambda: aws.lambda.Function;
    resourcePath: string;
}

export function createApiGateway(config: ApiGatewayConfig): aws.apigatewayv2.Api {
    const api = new aws.apigatewayv2.Api(`${config.apiName}-api`, {
        protocolType: "HTTP",
    });

    const integration = new aws.apigatewayv2.Integration(`${config.apiName}-integration`, {
        apiId: api.id,
        integrationType: "AWS_PROXY",
        integrationUri: config.lambda.arn,
        payloadFormatVersion: "2.0",
    });

    new aws.apigatewayv2.Route(`${config.apiName}-route`, {
        apiId: api.id,
        routeKey: "$default",
        target: pulumi.interpolate`integrations/${integration.id}`,
    });

    new aws.lambda.Permission(`${config.apiName}-apiPermission`, {
        action: "lambda:InvokeFunction",
        function: config.lambda,
        principal: "apigateway.amazonaws.com",
        sourceArn: pulumi.interpolate`${api.executionArn}/*/*`,
    });

    return api;
}

export interface SnsConfig {
    snsName: string;
    lambda: aws.lambda.Function;
}

export function createSns(config: SnsConfig): aws.sns.Topic {
    const topic = new aws.sns.Topic(`${config.snsName}-topic`, {
        name: `${config.snsName}-topic`
    });

    new aws.sns.TopicSubscription(`${config.snsName}-subscription`, {
        topic: topic,
        protocol: "lambda",
        endpoint: config.lambda.arn,
    });

    new aws.lambda.Permission(`${config.snsName}-snsPermission`, {
        action: "lambda:InvokeFunction",
        function: config.lambda,
        principal: "sns.amazonaws.com",
        sourceArn: topic.arn,
    });

    return topic;
}
