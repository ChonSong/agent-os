import { useState, useCallback } from "react";

function RootRedirect() {
  return <div style={{color: "white", padding: 20}}>Redirecting...</div>;
}

export default function App() {
  const [chatOpen] = useState(false);

  return (
    <div style={{color: "white", padding: 20, background: "#0a0e14", height: "100vh"}}>
      <h1>agent-os dashboard</h1>
      <p>Chat open: {String(chatOpen)}</p>
      <p>Working!</p>
    </div>
  );
}
