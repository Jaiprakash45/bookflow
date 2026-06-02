// ApiResponse gives every response the same shape
// { statusCode, data, message, success }
// makes frontend integration predictable

class ApiResponse {
  constructor(statusCode, data, message = "Success") {
    this.statusCode = statusCode
    this.data = data
    this.message = message
    this.success = statusCode < 400
  }
}

export default ApiResponse