// src/handlers/apiHandler.ts
import { APIGatewayProxyHandler } from "aws-lambda";
import { logEvent, handleError, parseEventData } from "./commonHandler";

export const handler: APIGatewayProxyHandler = async (event) => {
    try {
        logEvent(event);

        const data = parseEventData(event);
        // Process the data...
        
        return {
            statusCode: 200,
            body: JSON.stringify({ message: "Hello from API Gateway!", data }),
        };
    } catch (error) {
        return handleError(error);
    }
};

