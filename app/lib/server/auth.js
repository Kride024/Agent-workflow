function requireActionSecret(req, res) {
  if (req.headers["x-action-secret"] !== process.env.ACTION_SECRET) {
    res.status(401).json({ message: "unauthorized" });
    return false;
  }
  return true;
}

module.exports = { requireActionSecret };
