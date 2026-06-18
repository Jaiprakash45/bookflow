import React from "react";

import { Navigate } from "react-router-dom"
import { useAuth } from "../context/AuthContext"

// wraps pages that require login
// if no token → redirect to login page
const ProtectedRoute = ({ children }) => {
  const { token } = useAuth()

  if (!token) {
    return <Navigate to="/login" replace />
  }

  return children
}

export default ProtectedRoute