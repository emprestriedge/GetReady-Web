import React from "react";

/**
 * InkBackground - Provides a full-screen background image using an embedded 
 * radial gradient and strictly fills the viewport to allow internal scrolling.
 * Added subtle organic movement to make the background feel dynamic and alive.
 */
export default function InkBackground({ children }: { children?: React.ReactNode }) {
  const gradientStyle: React.CSSProperties = {
    background: `
      radial-gradient(circle at 80% 20%, rgba(255, 0, 122, 0.4) 0%, transparent 50%),
      radial-gradient(circle at 20% 80%, rgba(255, 0, 122, 0.3) 0%, transparent 60%),
      linear-gradient(135deg, #000000 0%, #1a1a1a 100%)
    `,
    position: "absolute",
    // Expand bounds slightly to accommodate translation/scaling without showing edges
    inset: "-10%",
    zIndex: 0,
    // Slow, subtle organic movement
    animation: "inkDrift 45s ease-in-out infinite"
  };

  return (
    <div style={{ 
      height: "100dvh", 
      width: "100%", 
      position: "relative", 
      backgroundColor: "#000", 
      overflow: "hidden",
      display: "flex",
      flexDirection: "column"
    }}>
      {/* Visual background layer matching your pink/black ink image */}
      <div style={gradientStyle} />
      
      {/* Overlay for better text legibility */}
      <div 
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 1,
          background: "linear-gradient(to bottom, rgba(0,0,0,0.2) 0%, rgba(0,0,0,0.6) 100%)",
          pointerEvents: "none"
        }}
      />

      {/* Content Layer - Fixed height to force main scroller to activate */}
      <div style={{ 
        position: "relative", 
        zIndex: 10, 
        flex: 1, 
        width: "100%",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden"
      }}>
        {children}
      </div>
    </div>
  );
}