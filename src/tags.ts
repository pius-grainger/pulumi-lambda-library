import * as pulumi from "@pulumi/pulumi";

export const standardTags: pulumi.Input<{ [key: string]: pulumi.Input<string> }> = {
    "Environment": "dev",
    "Project": "my-pulumi-project",
};
