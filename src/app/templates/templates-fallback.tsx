'use client';

import { useI18n } from '@/lib/i18n';
import styles from './templates.module.css';

export default function TemplatesFallback() {
  const { locale } = useI18n();
  const label = locale === 'ko' ? '템플릿을 불러오는 중' : locale === 'ja' ? 'テンプレートを読み込んでいます' : 'Loading templates';
  return <div className={styles.routeFallback} role="status" aria-label={label} aria-busy="true"><span aria-hidden="true" /></div>;
}
