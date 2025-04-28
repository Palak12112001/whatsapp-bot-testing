class ApiError extends Error {
    constructor(statusCode, message = "Something went wrong", stack = "") {
        super(message);  // Call the parent class constructor with the message
        this.statusCode = statusCode;  // Add the statusCode property
        this.message = message;  // Add the message property

        if (stack) {
            this.stack = stack;  // If a stack trace is provided, use it
        } else {
            Error.captureStackTrace(this, this.constructor);  // Capture the stack trace if not provided
        }
    }
}

module.exports = ApiError;
