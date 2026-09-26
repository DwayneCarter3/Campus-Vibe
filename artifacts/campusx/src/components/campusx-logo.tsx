import { useId } from "react";

type CampusXLogoProps = {
  width?: number | string;
  height?: number | string;
  className?: string;
  /** Adds a soft halo to the mark in dark mode; the lettering stays sharp. */
  glow?: boolean;
};

function XMark({ gradientId }: { gradientId: string }) {
  return (
    <>
      <path
        d="M13 10 51 54M51 10 13 54"
        fill="none"
        stroke={`url(#${gradientId})`}
        strokeWidth="10"
        strokeLinecap="round"
      />
      <path
        d="M18 16 32 32 46 16M32 32 46 48"
        fill="none"
        stroke="white"
        strokeOpacity=".42"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <g fill="white">
        <circle cx="13" cy="10" r="2.1" />
        <circle cx="51" cy="10" r="2.1" />
        <circle cx="13" cy="54" r="2.1" />
        <circle cx="51" cy="54" r="2.1" />
        <circle cx="32" cy="32" r="2.5" />
      </g>
    </>
  );
}

export function CampusXLogo({
  width = 148,
  height = 38,
  className,
  glow = false,
}: CampusXLogoProps) {
  // Multiple logos can appear on the same page without SVG gradient/filter ID collisions.
  const id = useId().replace(/:/g, "");
  const gradientId = `campusx-gradient-${id}`;
  const glowId = `campusx-glow-${id}`;

  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 245 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="CampusX"
      preserveAspectRatio="xMinYMid meet"
    >
      <defs>
        <linearGradient id={gradientId} x1="8" y1="4" x2="57" y2="60" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FF2E93" />
          <stop offset="1" stopColor="#FF6B00" />
        </linearGradient>
        {glow && (
          <filter id={glowId} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="5" />
          </filter>
        )}
      </defs>

      {glow && (
        <g className="opacity-0 dark:opacity-60" filter={`url(#${glowId})`}>
          <path
            d="M13 10 51 54M51 10 13 54"
            stroke={`url(#${gradientId})`}
            strokeWidth="13"
            strokeLinecap="round"
          />
        </g>
      )}
      <XMark gradientId={gradientId} />

      <text
        x="70"
        y="44"
        fill="currentColor"
        fontFamily="'Space Grotesk', Inter, system-ui, sans-serif"
        fontSize="37"
        fontWeight="700"
        letterSpacing="-1.8"
      >
        Campus<tspan fill={`url(#${gradientId})`}>X</tspan>
      </text>
    </svg>
  );
}