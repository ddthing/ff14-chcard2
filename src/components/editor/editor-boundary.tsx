'use client';

import { Component, type ReactNode } from 'react';
import { useI18n } from '@/lib/i18n';
import { getEditorRecoveryCopy } from './editor-errors';

function Recovery({ retry }: {retry: () => void}) {
  const {locale} = useI18n();
  const copy = getEditorRecoveryCopy(locale);
  return <div role="alert" style={{padding:'1rem'}}><p>{copy.recovery}</p><button type="button" onClick={retry}>{copy.retry}</button></div>;
}

/** Recover the failing inspector without discarding the editor store or canvas. */
export class EditorBoundary extends Component<{children: ReactNode; resetKey: string}, {failed: boolean}> {
  state = {failed:false};
  static getDerivedStateFromError() { return {failed:true}; }
  componentDidUpdate(previous: Readonly<{children: ReactNode; resetKey: string}>) {
    if (previous.resetKey !== this.props.resetKey && this.state.failed) this.setState({failed:false});
  }
  render() {
    return this.state.failed ? <Recovery retry={() => this.setState({failed:false})}/> : this.props.children;
  }
}
