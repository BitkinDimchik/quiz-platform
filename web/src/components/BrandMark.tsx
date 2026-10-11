type BrandMarkProps = {
  size?: number;
};

/** Overlapping discs — orange / amber / teal, the three brand hues. */
export function BrandMark({ size = 36 }: BrandMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      aria-hidden="true"
      className="brand-mark"
    >
      <circle cx="15" cy="17" r="12" fill="#FFC14A" />
      <circle cx="26" cy="15" r="11" fill="#FF6A2C" />
      <circle cx="21" cy="26" r="10" fill="#2A9D8F" fillOpacity="0.92" />
    </svg>
  );
}
