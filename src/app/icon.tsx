import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 6,
          background: "#000000",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span
          style={{
            fontSize: 13,
            fontWeight: 900,
            color: "#ec4899",
            letterSpacing: "-0.5px",
          }}
        >
          C
        </span>
        <span
          style={{
            fontSize: 13,
            fontWeight: 900,
            color: "#f97316",
            letterSpacing: "-0.5px",
          }}
        >
          R
        </span>
      </div>
    ),
    { ...size }
  );
}
