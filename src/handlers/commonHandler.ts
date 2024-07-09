// src/handlers/commonHandler.ts

/**
 * Common logging function
 * @param event - The event data to log
 */
export function logEvent(event: any) {
    console.log("Received event:", JSON.stringify(event, null, 2));
}

/**
 * Common error handler
 * @param error - The error to handle
 */
export function handleError(error: Error) {
    console.error("An error occurred:", error.message);
    return {
        statusCode: 500,
        body: JSON.stringify({ error: error.message }),
    };
}

/**
 * Function to parse and validate incoming event data
 * @param event - The event data to parse
 * @returns - Parsed data or throws an error if validation fails
 */
export function parseEventData(event: any) {
    try {
        // Example validation logic, adjust as needed
        if (!event.body) {
            throw new Error("Missing event body");
        }
        const data = JSON.parse(event.body);
        return data;
    } catch (error) {
        throw new Error("Invalid event data");
    }
}

