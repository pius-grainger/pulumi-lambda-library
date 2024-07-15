import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as path from "path";
import * as fs from "fs";

export interface LambdaTrigger {
    type: "apigateway" | "sns";
}

export interface LambdaConfig {
    name: string;
    handler: string;
    entryPoint: string;
    runtime: aws.lambda.Runtime;
    triggers: LambdaTrigger[];
    s3Bucket: aws.s3.Bucket;
    artifactPath: string;
    tags: pulumi.Input<{ [key: string]: pulumi.Input<string> }>; // Tags are required
}

export function createLambdaRole(name: string, tags: pulumi.Input<{ [key: string]: pulumi.Input<string> }>): aws.iam.Role {
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
        tags: tags,
    });

    new aws.iam.RolePolicyAttachment(`${name}-policy`, {
        role: lambdaRole,
        policyArn: aws.iam.ManagedPolicies.AWSLambdaBasicExecutionRole,
    });

    return lambdaRole;
}

export function uploadLambdaCodeToS3(bucket: aws.s3.Bucket, handlerFileName: string, artifactPath: string, tags: pulumi.Input<{ [key: string]: pulumi.Input<string> }>): aws.s3.BucketObject {
    if (!fs.existsSync(artifactPath)) {
        throw new Error(`Artifact ${artifactPath} not found. Please build the project first.`);
    }

    return new aws.s3.BucketObject(`${handlerFileName}.zip`, {
        bucket: bucket,
        source: new pulumi.asset.FileAsset(artifactPath),
        tags: tags,
    });
}

export function createLambda(config: LambdaConfig): aws.lambda.Function[] {
    const lambdaRole = createLambdaRole(config.name, config.tags);
    const lambdas: aws.lambda.Function[] = [];

    config.triggers.forEach(trigger => {
        const s3Object = uploadLambdaCodeToS3(config.s3Bucket, config.handler, config.artifactPath, config.tags);

        const lambda = new aws.lambda.Function(`${config.name}-${trigger.type}`, {
            s3Bucket: config.s3Bucket.bucket,
            s3Key: s3Object.key,
            role: lambdaRole.arn,
            handler: config.entryPoint,
            runtime: config.runtime,
            tags: config.tags,
        });

        lambdas.push(lambda);
    });

    return lambdas;
}

export interface ApiGatewayConfig {
    apiName: string;
    lambda: aws.lambda.Function;
    resourcePath: string;
    method: string;
    tags: pulumi.Input<{ [key: string]: pulumi.Input<string> }>; // Tags are required
}

export function createApiGateway(config: ApiGatewayConfig): aws.apigateway.RestApi {
    const api = new aws.apigateway.RestApi(`${config.apiName}-api`, {
        name: `${config.apiName}-api`,
        tags: config.tags,
    });

    const resource = new aws.apigateway.Resource(`${config.apiName}-resource`, {
        restApi: api.id,
        parentId: api.rootResourceId,
        pathPart: config.resourcePath,
    });

    const method = new aws.apigateway.Method(`${config.apiName}-method`, {
        restApi: api.id,
        resourceId: resource.id,
        httpMethod: config.method,
        authorization: "NONE",
    });

    const integration = new aws.apigateway.Integration(`${config.apiName}-integration`, {
        restApi: api.id,
        resourceId: resource.id,
        httpMethod: method.httpMethod,
        type: "AWS_PROXY",
        integrationHttpMethod: "POST",
        uri: config.lambda.invokeArn,
    });

    const deployment = new aws.apigateway.Deployment(`${config.apiName}-deployment`, {
        restApi: api.id,
        stageName: "v1",
    }, { dependsOn: [integration] });

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
    tags: pulumi.Input<{ [key: string]: pulumi.Input<string> }>; // Tags are required
}

export function createSns(config: SnsConfig): aws.sns.Topic {
    const topic = new aws.sns.Topic(`${config.snsName}-topic`, {
        name: `${config.snsName}-topic`,
        tags: config.tags,
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
