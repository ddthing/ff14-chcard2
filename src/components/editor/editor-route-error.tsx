'use client';

import {useI18n} from '@/lib/i18n';
import {getEditorRecoveryCopy} from './editor-errors';

export default function EditorRouteError({retry}: {retry: () => void}) {
  const {locale}=useI18n();
  const copy=getEditorRecoveryCopy(locale);
  return <section role="alert" style={{padding:'2rem'}}><p>{copy.recovery}</p><button type="button" onClick={retry}>{copy.retry}</button></section>;
}
