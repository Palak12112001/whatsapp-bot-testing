class ApiResponse {
    constructor(success, statusCode, message, data = null) {
        this.success = success;         // Boolean indicating if the request was successful or not
        this.statusCode = statusCode;   // HTTP status code (e.g., 200 for success, 404 for not found, etc.)
        this.message = message;         // Message providing additional info about the response
        this.data = data;               // Data to be returned in case of a successful request (optional)
    }
}

module.exports = ApiResponse;
