import { Suspense } from 'react';
import TemplatesRoute from './templates-route';
import TemplatesFallback from './templates-fallback';

export default function Page() {
  return (
    <Suspense fallback={<TemplatesFallback />}>
      <TemplatesRoute />
    </Suspense>
  );
}
