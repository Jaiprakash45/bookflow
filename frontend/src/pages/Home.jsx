import React from "react";

import { useAuth } from "../context/AuthContext"

const Home = () => {
  const { user } = useAuth()

  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-slate-800 mb-2">
          Welcome to BookFlow{user ? `, ${user.name}` : ""}
        </h1>
        <p className="text-slate-600">
          Events listing will appear here in Phase F2
        </p>
      </div>
    </div>
  )
}

export default Home