'use client';

import { useI18n } from '@/lib/i18n';
import styles from './create.module.css';

export default function CreateFallback() {
  const { locale } = useI18n();
  const label = locale === 'ko' ? '사진 선택을 불러오는 중' : locale === 'ja' ? '写真の選択画面を読み込んでいます' : 'Loading photo choices';
  return <div className={styles.routeFallback} role="status" aria-label={label} aria-busy="true"><span aria-hidden="true" /></div>;
}
