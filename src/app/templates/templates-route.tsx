'use client';

import { useSearchParams } from 'next/navigation';
import { parseTemplateChoice } from '@/app/create/create-draft';
import TemplatesPage from './templates-page';

export default function TemplatesRoute() {
  const searchParams = useSearchParams();
  const query = searchParams.toString();
  const initialTemplate = parseTemplateChoice(searchParams.get('template')) ?? 'editorial';
  return <TemplatesPage key={query || initialTemplate} initialTemplate={initialTemplate} />;
}
