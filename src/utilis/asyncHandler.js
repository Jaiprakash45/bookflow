// asyncHandler is a higher order function
// it takes a function (fn) and returns a new async function
// that catches any error and passes it to next()

const asyncHandler = (fn) => async (req, res, next) => {
  try {
    await fn(req, res, next)
  } catch (error) {
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message
    })
  }
}

export default asyncHandler