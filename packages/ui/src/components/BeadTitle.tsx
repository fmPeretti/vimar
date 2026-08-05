/**
 * The pony-bead lettering Vimar uses for post titles. One of the brand's most
 * recognisable motifs, so it gets first-class treatment here too.
 */
export function BeadTitle({ children }: { children: string }) {
  const text = children.toUpperCase();
  return (
    <span className="vm-bead" role="img" aria-label={children}>
      {[...text].map((char, index) => (
        <span
          // Position is the only stable identity for a letter in a fixed string.
          key={`${char}-${index}`}
          className={char === " " ? "vm-bead__b vm-bead__b--gap" : "vm-bead__b"}
          aria-hidden="true"
        >
          {char === " " ? "" : char}
        </span>
      ))}
    </span>
  );
}
