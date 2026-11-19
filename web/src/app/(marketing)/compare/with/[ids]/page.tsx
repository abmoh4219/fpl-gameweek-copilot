import type { Metadata } from "next";
import { CompareView, compareIds, compareMetadata } from "../../view";

type Params = { params: Promise<{ ids: string }> };

/**
 * /compare?p=<ids>, rewritten here by next.config so each comparison is a
 * cached page of its own (ADR-0025). It reads only the pipeline's data, which
 * changes every few hours, so an hour is fresh enough, as on /stats.
 */
export const revalidate = 3600;
export function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  return compareMetadata(compareIds((await params).ids));
}

export default async function CompareWith({ params }: Params) {
  return <CompareView chosen={compareIds((await params).ids)} />;
}
