"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createApiGatewayLambda = createApiGatewayLambda;
exports.createSnsLambda = createSnsLambda;
const pulumi = __importStar(require("@pulumi/pulumi"));
const aws = __importStar(require("@pulumi/aws"));
const path = __importStar(require("path"));
function createLambda(name, handlerPath) {
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
    const lambda = new aws.lambda.Function(name, {
        code: new pulumi.asset.AssetArchive({
            ".": new pulumi.asset.FileArchive(path.join(__dirname, handlerPath)),
        }),
        role: lambdaRole.arn,
        handler: "index.handler",
        runtime: aws.lambda.NodeJS14dXRuntime,
    });
    return lambda;
}
function createApiGatewayLambda(name) {
    return createLambda(name, "./handlers/apiHandler");
}
function createSnsLambda(name) {
    return createLambda(name, "./handlers/snsHandler");
}
