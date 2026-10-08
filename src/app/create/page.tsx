import { Suspense } from 'react';
import CreateRoute from './create-route';
import CreateFallback from './create-fallback';

export default function Page() {
  return (
    <Suspense fallback={<CreateFallback />}>
      <CreateRoute />
    </Suspense>
  );
}
