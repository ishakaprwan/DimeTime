// wrap async handlers so errors reach the error middleware
exports.wrap = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

exports.notFound = (req, res) => res.status(404).json({ error: "Not found." });

exports.errorHandler = (err, req, res, _next) => {
  if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
    return res.status(400).json({
      error: "Invalid JSON request body.",
    });
  }

  if (err.code === "23505") {
    return res.status(409).json({
      error: "This email account already exists.",
    });
  }

  if (err.code === "23503") {
    return res.status(400).json({
      error: "Invalid reference.",
    });
  }

  console.error(err);

  res.status(500).json({
    error: "Server error.",
  });
};