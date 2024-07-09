import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as path from "path";

export interface LambdaTrigger {
    type: "apigateway" | "sns";
    handlerPath: string;
}

export interface LambdaConfig {
    name: string;
    runtime: aws.lambda.Runtime;
    triggers: LambdaTrigger[];
}

function createLambdaRole(name: string): aws.iam.Role {
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

export function createLambda(config: LambdaConfig): aws.lambda.Function[] {
    const lambdaRole = createLambdaRole(config.name);
    const lambdas: aws.lambda.Function[] = [];

    config.triggers.forEach(trigger => {
        const lambda = new aws.lambda.Function(`${config.name}-${trigger.type}`, {
            code: new pulumi.asset.AssetArchive({
                ".": new pulumi.asset.FileArchive(path.join(__dirname, trigger.handlerPath)),
            }),
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

