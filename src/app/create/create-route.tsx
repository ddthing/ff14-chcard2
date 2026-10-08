'use client';

import { useSearchParams } from 'next/navigation';
import { parseTemplateChoice } from './create-draft';
import CreatePage from './create-page';

export default function CreateRoute() {
  const searchParams = useSearchParams();
  const query = searchParams.toString();
  const initialTemplate = parseTemplateChoice(searchParams.get('template')) ?? undefined;
  return <CreatePage key={query || 'no-template'} initialTemplate={initialTemplate} />;
}
