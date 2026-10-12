'use client';

import { useCallback, useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { CardPreview } from '@/components/editor/card-preview';
import { useI18n, type Locale } from '@/lib/i18n';
import {
  limitProjectName,
  ProjectLibraryError,
  projectLibrary,
  type ProjectImageMetadata,
  type ProjectLibrarySummary,
  type SavedProject,
} from '@/lib/project-library';
import { editorStore } from '@/store/editor-store';
import styles from './local-project-library.module.css';

type Copy = {
  title: string;
  storageLocation: string;
  close: string;
  saveTitle: string;
  projectName: string;
  projectNamePlaceholder: string;
  saveCurrent: string;
  saveToProject: string;
  stageSaveTarget: (name: string) => string;
  saving: string;
  loading: string;
  refresh: string;
  emptyTitle: string;
  emptyDescription: string;
  noName: string;
  open: (name: string) => string;
  openAction: string;
  preview: string;
  hidePreview: string;
  loadingPreview: string;
  rename: string;
  newName: string;
  saveName: string;
  cancel: string;
  duplicate: string;
  delete: string;
  deletePrompt: (name: string) => string;
  confirmDelete: string;
  switchTitle: (name: string) => string;
  switchDescription: (name: string) => string;
  saveAndOpen: string;
  replaceAndOpen: string;
  saved: (name: string) => string;
  renamed: (name: string) => string;
  duplicated: (name: string) => string;
  deleted: (name: string) => string;
  opened: (name: string) => string;
  localUnavailable: string;
  blocked: string;
  quota: string;
  corrupt: string;
  missing: string;
  invalidName: string;
  failed: string;
  persistFailed: string;
  unreadable: (count: number) => string;
  unnamedProject: string;
  copySuffix: string;
  dialogUnavailable: string;
  templates: Record<'cinematic' | 'editorial' | 'id-card', string>;
  character: string;
};

const COPY: Record<Locale, Copy> = {
  ko: {
    title: '내 프로젝트',
    storageLocation: '이 브라우저에 저장',
    close: '라이브러리 닫기',
    saveTitle: '현재 카드 저장',
    projectName: '프로젝트 이름',
    projectNamePlaceholder: '예: 림사에서의 밤',
    saveCurrent: '현재 카드 저장',
    saveToProject: '프로젝트로 보관',
    stageSaveTarget: (name) => `보관할 카드 · ${name}`,
    saving: '저장 중…',
    loading: '저장한 프로젝트를 불러오는 중…',
    refresh: '새로고침',
    emptyTitle: '아직 저장한 카드가 없습니다',
    emptyDescription: '현재 카드를 이름 붙여 저장하면 여기에 모입니다.',
    noName: '이름 없는 모험가',
    open: (name) => `${name} 열기`,
    openAction: '열기',
    preview: '미리보기',
    hidePreview: '미리보기 닫기',
    loadingPreview: '카드 불러오는 중…',
    rename: '이름 변경',
    newName: '새 프로젝트 이름',
    saveName: '이름 저장',
    cancel: '취소',
    duplicate: '복사본 만들기',
    delete: '삭제',
    deletePrompt: (name) => `“${name}” 프로젝트를 삭제할까요? 이 브라우저에 저장된 카드와 사진이 삭제됩니다.`,
    confirmDelete: '프로젝트 삭제',
    switchTitle: (name) => `“${name}” 프로젝트를 열까요?`,
    switchDescription: (name) => `현재 카드가 “${name}” 카드로 바뀝니다. 현재 작업을 보관하려면 먼저 라이브러리에 저장하세요.`,
    saveAndOpen: '현재 카드를 저장하고 열기',
    replaceAndOpen: '현재 카드를 바꾸고 열기',
    saved: (name) => `“${name}” 프로젝트를 저장했습니다.`,
    renamed: (name) => `프로젝트 이름을 “${name}”(으)로 바꿨습니다.`,
    duplicated: (name) => `“${name}” 복사본을 만들었습니다.`,
    deleted: (name) => `“${name}” 프로젝트를 삭제했습니다.`,
    opened: (name) => `“${name}” 프로젝트를 열었습니다.`,
    localUnavailable: '이 브라우저에서는 로컬 프로젝트 저장을 사용할 수 없습니다. 현재 편집기 초안은 별도로 유지됩니다.',
    blocked: '다른 탭에서 라이브러리를 사용 중입니다. 해당 탭을 닫은 뒤 다시 시도하세요.',
    quota: '브라우저 저장 공간이 부족해 저장하지 못했습니다. 저장한 프로젝트를 정리하거나 사진 크기를 줄여 보세요.',
    corrupt: '저장한 프로젝트를 안전하게 읽지 못했습니다. 다른 프로젝트는 그대로 유지됩니다.',
    missing: '이 프로젝트를 찾을 수 없습니다. 목록을 새로고침해 보세요.',
    invalidName: '프로젝트 이름을 1~80자로 입력하세요.',
    failed: '요청을 완료하지 못했습니다. 저장 상태를 확인한 뒤 다시 시도하세요.',
    persistFailed: '프로젝트는 열렸지만 브라우저 초안 저장에 실패했습니다. 새로고침하면 이전 초안이 다시 열릴 수 있습니다.',
    unreadable: (count) => `읽을 수 없는 프로젝트 ${count}개를 건너뛰었습니다. 삭제하거나 다시 저장하기 전까지 원본은 유지됩니다.`,
    unnamedProject: '이름 없는 카드',
    copySuffix: '복사본',
    dialogUnavailable: '이 브라우저에서는 접근성 모달 대화상자를 열 수 없습니다.',
    templates: { cinematic: '시네마틱', editorial: '에디토리얼', 'id-card': '모험가 기록' },
    character: '캐릭터',
  },
  en: {
    title: 'My projects',
    storageLocation: 'Saved in this browser',
    close: 'Close project library',
    saveTitle: 'Save current card',
    projectName: 'Project name',
    projectNamePlaceholder: 'For example, Night in Limsa',
    saveCurrent: 'Save current card',
    saveToProject: 'Save as project',
    stageSaveTarget: (name) => `Card to save · ${name}`,
    saving: 'Saving…',
    loading: 'Loading saved projects…',
    refresh: 'Refresh',
    emptyTitle: 'No saved cards yet',
    emptyDescription: 'Name and save the current card to keep it here.',
    noName: 'Unnamed adventurer',
    open: (name) => `Open ${name}`,
    openAction: 'Open',
    preview: 'Preview',
    hidePreview: 'Hide preview',
    loadingPreview: 'Loading card…',
    rename: 'Rename',
    newName: 'New project name',
    saveName: 'Save name',
    cancel: 'Cancel',
    duplicate: 'Make a copy',
    delete: 'Delete',
    deletePrompt: (name) => `Delete “${name}”? Its saved card and photo will be removed from this browser.`,
    confirmDelete: 'Delete project',
    switchTitle: (name) => `Open “${name}”?`,
    switchDescription: (name) => `The current card will be replaced with “${name}”. Save the current work to the library first if you want to keep it.`,
    saveAndOpen: 'Save current card and open',
    replaceAndOpen: 'Replace current card and open',
    saved: (name) => `Saved “${name}”.`,
    renamed: (name) => `Renamed the project to “${name}”.`,
    duplicated: (name) => `Created a copy named “${name}”.`,
    deleted: (name) => `Deleted “${name}”.`,
    opened: (name) => `Opened “${name}”.`,
    localUnavailable: 'Local project storage is unavailable in this browser. The editor draft remains separate.',
    blocked: 'Another tab is using the library. Close that tab and try again.',
    quota: 'There is not enough browser storage to save this project. Delete a saved project or use a smaller photo.',
    corrupt: 'This saved project could not be read safely. Other projects are unchanged.',
    missing: 'This project is no longer available. Refresh the list and try again.',
    invalidName: 'Enter a project name between 1 and 80 characters.',
    failed: 'The action could not be completed. Check the save status and try again.',
    persistFailed: 'The project opened, but the browser draft could not be saved. Reloading may restore the previous draft.',
    unreadable: (count) => `Skipped ${count} project${count === 1 ? '' : 's'} that could not be read. Their stored data is unchanged.`,
    unnamedProject: 'Untitled card',
    copySuffix: 'copy',
    dialogUnavailable: 'This browser cannot open an accessible modal dialog.',
    templates: { cinematic: 'Cinematic', editorial: 'Editorial', 'id-card': 'Adventurer Record' },
    character: 'Character',
  },
  ja: {
    title: 'マイプロジェクト',
    storageLocation: 'このブラウザーに保存',
    close: 'ライブラリを閉じる',
    saveTitle: '現在のカードを保存',
    projectName: 'プロジェクト名',
    projectNamePlaceholder: '例：リムサの夜',
    saveCurrent: '現在のカードを保存',
    saveToProject: 'プロジェクトとして保存',
    stageSaveTarget: (name) => `保存するカード · ${name}`,
    saving: '保存中…',
    loading: '保存したプロジェクトを読み込み中…',
    refresh: '再読み込み',
    emptyTitle: '保存したカードはありません',
    emptyDescription: '現在のカードに名前を付けて保存すると、ここに表示されます。',
    noName: '名前のない冒険者',
    open: (name) => `${name}を開く`,
    openAction: '開く',
    preview: 'プレビュー',
    hidePreview: 'プレビューを閉じる',
    loadingPreview: 'カードを読み込み中…',
    rename: '名前を変更',
    newName: '新しいプロジェクト名',
    saveName: '名前を保存',
    cancel: 'キャンセル',
    duplicate: '複製を作成',
    delete: '削除',
    deletePrompt: (name) => `「${name}」を削除しますか？保存したカードと写真はこのブラウザーから削除されます。`,
    confirmDelete: 'プロジェクトを削除',
    switchTitle: (name) => `「${name}」を開きますか？`,
    switchDescription: (name) => `現在のカードは「${name}」に置き換わります。現在の作業を残す場合は、先にライブラリへ保存してください。`,
    saveAndOpen: '現在のカードを保存して開く',
    replaceAndOpen: '現在のカードを置き換えて開く',
    saved: (name) => `「${name}」を保存しました。`,
    renamed: (name) => `プロジェクト名を「${name}」に変更しました。`,
    duplicated: (name) => `「${name}」の複製を作成しました。`,
    deleted: (name) => `「${name}」を削除しました。`,
    opened: (name) => `「${name}」を開きました。`,
    localUnavailable: 'このブラウザーではローカル保存を利用できません。エディターの下書きは別に保存されています。',
    blocked: '別のタブがライブラリを使用中です。そのタブを閉じてからもう一度お試しください。',
    quota: 'ブラウザーの保存容量が不足しています。保存済みプロジェクトを整理するか、写真のサイズを小さくしてください。',
    corrupt: 'このプロジェクトを安全に読み込めませんでした。他のプロジェクトは変更されていません。',
    missing: 'このプロジェクトは見つかりません。リストを再読み込みしてください。',
    invalidName: 'プロジェクト名は1〜80文字で入力してください。',
    failed: '処理を完了できませんでした。保存状態を確認して、もう一度お試しください。',
    persistFailed: 'プロジェクトは開きましたが、ブラウザーの下書きを保存できませんでした。再読み込みすると前の下書きが表示される場合があります。',
    unreadable: (count) => `読み込めないプロジェクト${count}件をスキップしました。保存データは変更していません。`,
    unnamedProject: '名前のないカード',
    copySuffix: 'のコピー',
    dialogUnavailable: 'このブラウザーではアクセシブルなモーダルダイアログを開けません。',
    templates: { cinematic: 'シネマティック', editorial: 'エディトリアル', 'id-card': '冒険者の記録' },
    character: 'キャラクター',
  },
};

function errorMessage(error: unknown, copy: Copy): string {
  if (error instanceof ProjectLibraryError) {
    switch (error.code) {
      case 'unavailable': return copy.localUnavailable;
      case 'blocked': return copy.blocked;
      case 'quota': return copy.quota;
      case 'corrupt': return copy.corrupt;
      case 'missing': return copy.missing;
      case 'invalid-name': return copy.invalidName;
      default: return copy.failed;
    }
  }
  return copy.failed;
}

function currentProjectName(locale: Locale): string {
  const state = editorStore.getState();
  return state.character.name.trim() || COPY[locale].unnamedProject;
}

function currentImageMetadata(): ProjectImageMetadata {
  const image = editorStore.getState().image;
  return { fileName: image.fileName, mimeType: image.mimeType };
}

function ensureEditorHydrated(): void {
  const state = editorStore.getState();
  if (!state.isHydrated) state.hydrate();
}

function formatDate(value: number, locale: Locale): string {
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(value);
  } catch {
    return new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(value);
  }
}

function copyProjectName(name: string, suffix: string): string {
  const candidate = `${name} ${suffix}`.trim();
  return Array.from(candidate).slice(0, 80).join('');
}

type LibraryPanelProps = {
  copy: Copy;
  locale: Locale;
  dialog: boolean;
  titleId: string;
  stagePresentation?: boolean;
  stageAside?: ReactNode;
  stageSaveTarget?: string;
  onClose?: () => void;
};

function LibraryPanel({ copy, locale, dialog, titleId, stagePresentation = false, stageAside, stageSaveTarget, onClose }: LibraryPanelProps) {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectLibrarySummary[]>([]);
  const [hasSuccessfulRead, setHasSuccessfulRead] = useState(false);
  const [unreadableCount, setUnreadableCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [saveName, setSaveName] = useState('');
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameName, setRenameName] = useState('');
  const [pendingDelete, setPendingDelete] = useState<ProjectLibrarySummary | null>(null);
  const [pendingOpen, setPendingOpen] = useState<ProjectLibrarySummary | null>(null);
  const [openCurrentName, setOpenCurrentName] = useState('');
  const [preview, setPreview] = useState<SavedProject | null>(null);
  const [loadingPreviewId, setLoadingPreviewId] = useState<string | null>(null);
  const nameId = useId();
  const openNameId = useId();
  const renameInputRef = useRef<HTMLInputElement>(null);
  const openInputRef = useRef<HTMLInputElement>(null);
  const openTriggerRef = useRef<HTMLButtonElement>(null);
  const renameTriggerRef = useRef<HTMLButtonElement>(null);
  const deleteTriggerRef = useRef<HTMLButtonElement>(null);
  const deleteCancelRef = useRef<HTMLButtonElement>(null);
  const refreshButtonRef = useRef<HTMLButtonElement>(null);
  const focusRefreshAfterDeleteRef = useRef(false);

  function focusIfConnected(target: HTMLButtonElement | null): void {
    if (target?.isConnected) target.focus();
  }

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const result = await projectLibrary.list();
      setProjects(result.projects);
      setUnreadableCount(result.unreadableCount);
      setHasSuccessfulRead(true);
      setError('');
    } catch (loadError) {
      setError(errorMessage(loadError, copy));
    } finally {
      setLoading(false);
    }
  }, [copy]);

  useEffect(() => {
    let active = true;
    projectLibrary.list().then((result) => {
      if (!active) return;
      setProjects(result.projects);
      setUnreadableCount(result.unreadableCount);
      setHasSuccessfulRead(true);
      setError('');
    }).catch((loadError: unknown) => {
      if (active) setError(errorMessage(loadError, copy));
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [copy]);

  useEffect(() => {
    if (renameId) renameInputRef.current?.focus();
  }, [renameId]);

  useEffect(() => {
    if (pendingOpen) openInputRef.current?.focus();
  }, [pendingOpen]);

  useEffect(() => {
    if (pendingDelete) deleteCancelRef.current?.focus();
  }, [pendingDelete]);

  useEffect(() => {
    if (!focusRefreshAfterDeleteRef.current || loading || working) return;
    focusIfConnected(refreshButtonRef.current);
    focusRefreshAfterDeleteRef.current = false;
  }, [loading, working]);

  function beginOpen(project: ProjectLibrarySummary, trigger: HTMLButtonElement): void {
    openTriggerRef.current = trigger;
    ensureEditorHydrated();
    setFeedback('');
    setError('');
    setPendingOpen(project);
    setOpenCurrentName(currentProjectName(locale));
  }

  function cancelOpen(): void {
    setPendingOpen(null);
    focusIfConnected(openTriggerRef.current);
  }

  function beginRename(project: ProjectLibrarySummary, trigger: HTMLButtonElement): void {
    renameTriggerRef.current = trigger;
    setRenameId(project.id);
    setRenameName(project.name);
  }

  function cancelRename(): void {
    setRenameId(null);
    focusIfConnected(renameTriggerRef.current);
  }

  function beginDelete(project: ProjectLibrarySummary, trigger: HTMLButtonElement): void {
    deleteTriggerRef.current = trigger;
    setPendingDelete(project);
  }

  function cancelDelete(): void {
    setPendingDelete(null);
    focusIfConnected(deleteTriggerRef.current);
  }

  async function switchToProject(project: SavedProject): Promise<boolean> {
    editorStore.getState().replaceCardData(project.data, { imageMetadata: project.imageMetadata });
    if (!editorStore.getState().persistNow()) {
      setError(copy.persistFailed);
      return false;
    }
    setPendingOpen(null);
    setFeedback(copy.opened(project.name));
    if (dialog) onClose?.();
    else router.push('/editor');
    return true;
  }

  async function saveAndOpen(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!pendingOpen || working) return;
    setWorking(true);
    setError('');
    setFeedback('');
    try {
      const target = await projectLibrary.get(pendingOpen.id);
      ensureEditorHydrated();
      const state = editorStore.getState();
      await projectLibrary.save({
        name: openCurrentName,
        data: state.toCardData(),
        imageMetadata: currentImageMetadata(),
      });
      void refresh();
      await switchToProject(target);
    } catch (saveError) {
      setError(errorMessage(saveError, copy));
    } finally {
      setWorking(false);
    }
  }

  async function replaceAndOpen(): Promise<void> {
    if (!pendingOpen || working) return;
    setWorking(true);
    setError('');
    setFeedback('');
    try {
      const target = await projectLibrary.get(pendingOpen.id);
      ensureEditorHydrated();
      await switchToProject(target);
    } catch (openError) {
      setError(errorMessage(openError, copy));
    } finally {
      setWorking(false);
    }
  }

  async function saveCurrent(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (working) return;
    setWorking(true);
    setError('');
    setFeedback('');
    try {
      ensureEditorHydrated();
      const state = editorStore.getState();
      const project = await projectLibrary.save({
        name: saveName,
        data: state.toCardData(),
        imageMetadata: currentImageMetadata(),
      });
      setSaveName('');
      setFeedback(copy.saved(project.name));
      void refresh();
    } catch (saveError) {
      setError(errorMessage(saveError, copy));
    } finally {
      setWorking(false);
    }
  }

  async function saveRename(project: ProjectLibrarySummary, event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (working) return;
    setWorking(true);
    setError('');
    setFeedback('');
    try {
      const saved = await projectLibrary.rename(project.id, renameName);
      if (!saved) throw new ProjectLibraryError('missing', 'Project not found.');
      setRenameId(null);
      setFeedback(copy.renamed(renameName.trim()));
      focusIfConnected(renameTriggerRef.current);
      void refresh();
    } catch (renameError) {
      setError(errorMessage(renameError, copy));
    } finally {
      setWorking(false);
    }
  }

  async function duplicate(project: ProjectLibrarySummary): Promise<void> {
    if (working) return;
    setWorking(true);
    setError('');
    setFeedback('');
    const name = copyProjectName(project.name, copy.copySuffix);
    try {
      const result = await projectLibrary.duplicate(project.id, name);
      setFeedback(copy.duplicated(result.name));
      void refresh();
    } catch (duplicateError) {
      setError(errorMessage(duplicateError, copy));
    } finally {
      setWorking(false);
    }
  }

  async function deleteProject(): Promise<void> {
    if (!pendingDelete || working) return;
    setWorking(true);
    setError('');
    setFeedback('');
    try {
      await projectLibrary.delete(pendingDelete.id);
      setFeedback(copy.deleted(pendingDelete.name));
      if (preview?.id === pendingDelete.id) setPreview(null);
      setPendingDelete(null);
      focusRefreshAfterDeleteRef.current = true;
      void refresh();
    } catch (deleteError) {
      setError(errorMessage(deleteError, copy));
    } finally {
      setWorking(false);
    }
  }

  async function togglePreview(project: ProjectLibrarySummary): Promise<void> {
    if (preview?.id === project.id) {
      setPreview(null);
      return;
    }
    setLoadingPreviewId(project.id);
    setError('');
    try {
      setPreview(await projectLibrary.get(project.id));
    } catch (previewError) {
      setError(errorMessage(previewError, copy));
    } finally {
      setLoadingPreviewId(null);
    }
  }

  function handleDecisionKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key !== 'Escape') return;
    if (!pendingOpen && !pendingDelete && !renameId) return;

    // Keep Escape inside the active inline decision instead of also closing a parent dialog.
    event.preventDefault();
    event.stopPropagation();
    if (working) return;

    if (pendingOpen) cancelOpen();
    else if (pendingDelete) cancelDelete();
    else cancelRename();
  }

  const header = (
    <header className={styles.header}>
      <div>
        <h2 id={titleId} className={styles.title}>{copy.title}</h2>
      </div>
      {dialog && onClose ? (
        <button className={styles.closeButton} type="button" onClick={onClose} aria-label={copy.close}>
          <span aria-hidden="true">×</span>
        </button>
      ) : null}
    </header>
  );

  const saveForm = (
    <form className={styles.saveForm} onSubmit={saveCurrent}>
      <div className={styles.saveField}>
        <label htmlFor={nameId}>{copy.projectName}</label>
        <input
          id={nameId}
          type="text"
          value={saveName}
          onChange={(event) => setSaveName(limitProjectName(event.currentTarget.value))}
          placeholder={copy.projectNamePlaceholder}
          autoComplete="off"
        />
      </div>
      <button className={styles.primaryButton} type="submit" disabled={working || !saveName.trim()}>
        {working ? copy.saving : stagePresentation ? copy.saveToProject : copy.saveCurrent}
      </button>
    </form>
  );

  const content = (
    <div className={dialog ? styles.dialogPanel : styles.sectionPanel} onKeyDown={handleDecisionKeyDown}>
      {stagePresentation && !dialog ? (
        <div className={styles.stageWorkspace} data-has-aside={stageAside ? 'true' : undefined}>
          {stageAside ? <div className={styles.stageAside}>{stageAside}</div> : null}
          <div className={styles.savePanel}>
            {header}
            {stageSaveTarget ? <p className={styles.stageSaveTarget}>{copy.stageSaveTarget(stageSaveTarget)}</p> : null}
            {saveForm}
          </div>
        </div>
      ) : (
        <>
          {header}
          {saveForm}
        </>
      )}

      {pendingOpen ? (
        <section className={styles.decision} aria-labelledby={`${titleId}-switch`}>
          <h3 id={`${titleId}-switch`}>{copy.switchTitle(pendingOpen.name)}</h3>
          <p>{copy.switchDescription(pendingOpen.name)}</p>
          <form onSubmit={saveAndOpen} className={styles.switchSaveForm}>
            <label htmlFor={openNameId}>{copy.projectName}</label>
            <input
              ref={openInputRef}
              id={openNameId}
              type="text"
              value={openCurrentName}
              onChange={(event) => setOpenCurrentName(limitProjectName(event.currentTarget.value))}
              autoComplete="off"
            />
            <button className={styles.primaryButton} type="submit" disabled={working || !openCurrentName.trim()}>
              {working ? copy.saving : copy.saveAndOpen}
            </button>
          </form>
          <div className={styles.decisionActions}>
            <button className={styles.dangerButton} type="button" onClick={() => void replaceAndOpen()} disabled={working}>
              {copy.replaceAndOpen}
            </button>
            <button className={styles.secondaryButton} type="button" onClick={cancelOpen} disabled={working}>
              {copy.cancel}
            </button>
          </div>
        </section>
      ) : null}

      {pendingDelete ? (
        <section className={styles.decision} aria-labelledby={`${titleId}-delete`}>
          <h3 id={`${titleId}-delete`}>{copy.deletePrompt(pendingDelete.name)}</h3>
          <div className={styles.decisionActions}>
            <button className={styles.dangerButton} type="button" onClick={() => void deleteProject()} disabled={working}>
              {working ? copy.saving : copy.confirmDelete}
            </button>
            <button ref={deleteCancelRef} className={styles.secondaryButton} type="button" onClick={cancelDelete} disabled={working}>
              {copy.cancel}
            </button>
          </div>
        </section>
      ) : null}

      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      {feedback ? <p className={styles.feedback} role="status">{feedback}</p> : null}
      {unreadableCount > 0 ? <p className={styles.warning} role="status">{copy.unreadable(unreadableCount)}</p> : null}

      <div className={styles.listHeading}>
        <button ref={refreshButtonRef} className={styles.textButton} type="button" onClick={() => void refresh()} disabled={loading || working}>
          {copy.refresh}
        </button>
      </div>

      {loading ? <p className={styles.muted} role="status">{copy.loading}</p> : projects.length === 0 ? (
        hasSuccessfulRead && !error ? (
          <div className={styles.emptyState}>
            <p className={styles.emptyTitle}>{copy.emptyTitle}</p>
            <p className={styles.muted}>{copy.emptyDescription}</p>
          </div>
        ) : null
      ) : (
        <ul className={styles.projectList}>
          {projects.map((project) => (
            <li className={styles.projectItem} key={project.id}>
              <div className={styles.projectInfo}>
                <div className={styles.projectCopy}>
                  <h3>{project.name}</h3>
                  <p>{project.characterName || copy.noName} <span aria-hidden="true">·</span> {project.job || copy.noName}</p>
                  <p className={styles.projectMeta}>{copy.templates[project.template]} <span aria-hidden="true">·</span> {project.ratio} <span aria-hidden="true">·</span> {formatDate(project.updatedAt, locale)}</p>
                </div>
                <div className={styles.projectActions}>
                  <button className={styles.primaryButton} type="button" data-action="open-project" aria-label={copy.open(project.name)} onClick={(event) => beginOpen(project, event.currentTarget)} disabled={working}>
                    {copy.openAction}
                  </button>
                  <button
                    className={styles.textButton}
                    type="button"
                    onClick={() => void togglePreview(project)}
                    disabled={working || loadingPreviewId === project.id}
                    aria-label={`${loadingPreviewId === project.id ? copy.loadingPreview : preview?.id === project.id ? copy.hidePreview : copy.preview}: ${project.name}`}
                    aria-expanded={preview?.id === project.id}
                    aria-controls={preview?.id === project.id ? `${titleId}-preview-${project.id}` : undefined}
                  >
                    {loadingPreviewId === project.id ? copy.loadingPreview : preview?.id === project.id ? copy.hidePreview : copy.preview}
                  </button>
                  <button className={styles.textButton} type="button" aria-label={`${copy.rename}: ${project.name}`} onClick={(event) => beginRename(project, event.currentTarget)} disabled={working}>
                    {copy.rename}
                  </button>
                  <button className={styles.textButton} type="button" aria-label={`${copy.duplicate}: ${project.name}`} onClick={() => void duplicate(project)} disabled={working}>
                    {copy.duplicate}
                  </button>
                  <button className={styles.dangerButton} type="button" data-action="delete-project" aria-label={`${copy.delete}: ${project.name}`} onClick={(event) => beginDelete(project, event.currentTarget)} disabled={working}>
                    {copy.delete}
                  </button>
                </div>
              </div>

              {renameId === project.id ? (
                <form className={styles.renameForm} onSubmit={(event) => void saveRename(project, event)}>
                  <label htmlFor={`${titleId}-rename-${project.id}`}>{copy.newName}</label>
                  <input
                    ref={renameInputRef}
                    id={`${titleId}-rename-${project.id}`}
                    type="text"
                    value={renameName}
                    onChange={(event) => setRenameName(limitProjectName(event.currentTarget.value))}
                    autoComplete="off"
                  />
                  <button className={styles.primaryButton} type="submit" disabled={working || !renameName.trim()}>{copy.saveName}</button>
                  <button className={styles.secondaryButton} type="button" onClick={cancelRename} disabled={working}>{copy.cancel}</button>
                </form>
              ) : null}

              {loadingPreviewId === project.id ? <p className={styles.muted} role="status">{copy.loadingPreview}</p> : null}
              {preview?.id === project.id ? (
                <div
                  id={`${titleId}-preview-${project.id}`}
                  className={styles.preview}
                  role="region"
                  aria-label={`${copy.preview}: ${project.name}`}
                >
                  <CardPreview data={preview.data} />
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <footer className={styles.footerNote}>
        <p>{copy.storageLocation}</p>
      </footer>
    </div>
  );

  return content;
}

type LocalProjectLibraryProps = {
  compact?: boolean;
  presentation?: 'default' | 'stage';
  stageAside?: ReactNode;
  stageSaveTarget?: string;
};

/** Home-page local project library section. */
export function LocalProjectLibrary({ compact = false, presentation = 'default', stageAside, stageSaveTarget }: LocalProjectLibraryProps = {}) {
  const { locale } = useI18n();
  const titleId = useId();
  return (
    <section
      id="my-projects"
      className={styles.section}
      data-compact={compact || presentation === 'stage' || undefined}
      data-presentation={presentation === 'stage' ? 'stage' : undefined}
      aria-labelledby={titleId}
    >
      <LibraryPanel
        copy={COPY[locale]}
        locale={locale}
        dialog={false}
        titleId={titleId}
        stagePresentation={presentation === 'stage'}
        stageAside={presentation === 'stage' ? stageAside : undefined}
        stageSaveTarget={presentation === 'stage' ? stageSaveTarget : undefined}
      />
    </section>
  );
}

/** Editor entry point. Native dialog behavior supplies focus trapping, Escape, and focus return. */
export function ProjectLibraryDialogTrigger() {
  const { locale } = useI18n();
  const copy = COPY[locale];
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [dialogError, setDialogError] = useState('');
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!open || !dialog) return;
    dialog.showModal();
    const trigger = triggerRef.current;
    return () => {
      if (dialog.open) dialog.close();
      trigger?.focus();
    };
  }, [open]);

  function close(): void {
    setOpen(false);
  }

  function handleCancel(event: FormEvent<HTMLDialogElement>): void {
    event.preventDefault();
    close();
  }

  function handleBackdropClick(event: MouseEvent<HTMLDialogElement>): void {
    if (event.target === event.currentTarget) close();
  }

  function openLibrary(): void {
    if (typeof window !== 'undefined' &&
        (typeof HTMLDialogElement === 'undefined' || typeof HTMLDialogElement.prototype.showModal !== 'function')) {
      setDialogError(copy.dialogUnavailable);
      return;
    }
    setDialogError('');
    setOpen(true);
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={styles.triggerButton}
        onClick={openLibrary}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? `${titleId}-dialog` : undefined}
      >
        {copy.title}
      </button>
      {dialogError ? <p className={styles.error} role="alert">{dialogError}</p> : null}
      {open ? (
        <dialog
          ref={dialogRef}
          id={`${titleId}-dialog`}
          className={styles.dialog}
          aria-labelledby={titleId}
          data-editor-shortcuts-disabled="true"
          onCancel={handleCancel}
          onClick={handleBackdropClick}
          onClose={() => setOpen(false)}
        >
          <LibraryPanel copy={copy} locale={locale} dialog titleId={titleId} onClose={close} />
        </dialog>
      ) : null}
    </>
  );
}
