/**
 * The explanation under a chart, folded away by default (redesign): the chart
 * leads, the method is one tap away for anyone who wants it.
 */
export function How({ children, label = "How it's calculated" }: { children: React.ReactNode; label?: string }) {
  return (
    <details className="ins-how">
      <summary>{label}</summary>
      <p>{children}</p>
    </details>
  );
}
