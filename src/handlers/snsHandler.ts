// src/handlers/snsHandler.ts
import { SNSEvent, Context } from "aws-lambda";
import { logEvent, handleError } from "./commonHandler";

export const handler = async (event: SNSEvent, context: Context) => {
    try {
        logEvent(event);

        for (const record of event.Records) {
            const snsMessage = record.Sns;
            // Process the SNS message...
            console.log("Message received from SNS:", snsMessage.Message);
        }

        return {
            statusCode: 200,
            body: JSON.stringify({ message: "Hello from SNS!" }),
        };
    } catch (error) {
        return handleError(error);
    }
};

