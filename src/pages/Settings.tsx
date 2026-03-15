import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { complete, type LlmConfig } from '../lib/llm/client';
import { softDeleteAllData } from '../db/repositories/admin';
import { ConfirmDeleteModal } from '../components/settings/ConfirmDeleteModal';
import { ConfirmImportModal } from '../components/settings/ConfirmImportModal';
import { exportAllData } from '../lib/dataExport';
import { importAllData } from '../lib/dataImport';
import { useSettingsStore } from '../store/settings';
import type { LlmProvider } from '../types';
import { UI } from '../ui-strings';
import styles from './Settings.module.css';

const DEFAULT_MODEL_BY_PROVIDER: Record<LlmProvider, string> = {
  gemini: 'gemini-2.0-flash-lite',
  openai: 'gpt-4o-mini',
  ollama: 'llama3',
};

function getModelPlaceholder(provider: LlmProvider): string {
  if (provider === 'gemini') {
    return UI.settings.modelPlaceholderGemini;
  }

  if (provider === 'openai') {
    return UI.settings.modelPlaceholderOpenAI;
  }

  return UI.settings.modelPlaceholderOllama;
}

function toNullable(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function Settings() {
  const {
    llmProvider,
    llmApiKey,
    llmBaseUrl,
    llmModel,
    theme,
    saveLlmConfig,
    saveTheme,
  } = useSettingsStore();

  const [provider, setProvider] = useState<LlmProvider>(
    llmProvider ?? 'gemini',
  );
  const [apiKey, setApiKey] = useState(llmApiKey ?? '');
  const [baseUrl, setBaseUrl] = useState(llmBaseUrl ?? '');
  const [model, setModel] = useState(
    llmModel ?? DEFAULT_MODEL_BY_PROVIDER[llmProvider ?? 'gemini'],
  );
  const [showApiKey, setShowApiKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);
  const [exportingData, setExportingData] = useState(false);
  const [importingData, setImportingData] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [pendingImportFile, setPendingImportFile] = useState<File | null>(null);
  const [dataResult, setDataResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!llmProvider) {
      return;
    }

    setProvider(llmProvider);
    setApiKey(llmApiKey ?? '');
    setBaseUrl(llmBaseUrl ?? '');
    setModel(llmModel ?? DEFAULT_MODEL_BY_PROVIDER[llmProvider]);
  }, [llmProvider, llmApiKey, llmBaseUrl, llmModel]);

  const modelPlaceholder = useMemo(
    () => getModelPlaceholder(provider),
    [provider],
  );

  const handleSave = async () => {
    setSaving(true);
    setTestResult(null);

    try {
      await saveLlmConfig({
        provider,
        apiKey: provider === 'ollama' ? null : toNullable(apiKey),
        baseUrl: provider === 'gemini' ? null : toNullable(baseUrl),
        model: model.trim() || DEFAULT_MODEL_BY_PROVIDER[provider],
      });
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);

    const config: LlmConfig = {
      provider,
      apiKey: provider === 'ollama' ? toNullable(apiKey) : toNullable(apiKey),
      baseUrl: provider === 'gemini' ? null : toNullable(baseUrl),
      model: model.trim() || DEFAULT_MODEL_BY_PROVIDER[provider],
    };

    try {
      await complete(
        [{ role: 'user', content: 'Reply with the word OK.' }],
        config,
        { maxTokens: 16 },
      );

      setTestResult({ ok: true, message: UI.settings.testConnectionSuccess });
    } catch (err) {
      const detail = err instanceof Error ? err.message : UI.common.error;
      setTestResult({
        ok: false,
        message: `${UI.settings.testConnectionFail} ${detail}`,
      });
    } finally {
      setTesting(false);
    }
  };

  const handleExportData = async () => {
    setExportingData(true);
    setDataResult(null);

    try {
      await exportAllData();
    } catch (err) {
      const detail = err instanceof Error ? err.message : UI.common.error;
      setDataResult({ ok: false, message: `${UI.common.error} ${detail}` });
    } finally {
      setExportingData(false);
    }
  };

  const handleImportClick = () => {
    importInputRef.current?.click();
  };

  const handleFileSelected = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    if (!file) {
      return;
    }

    setPendingImportFile(file);
    setImportModalOpen(true);
  };

  const handleConfirmImport = async () => {
    if (!pendingImportFile) {
      return;
    }

    setImportingData(true);
    setDataResult(null);

    try {
      const result = await importAllData(pendingImportFile);

      if (result.errors.length > 0) {
        setDataResult({
          ok: false,
          message: `${UI.settings.importSuccess(result.imported)} ${UI.settings.importError}`,
        });
      } else {
        setDataResult({
          ok: true,
          message: UI.settings.importSuccess(result.imported),
        });
      }
    } catch {
      setDataResult({ ok: false, message: UI.settings.importError });
    } finally {
      setImportingData(false);
      setImportModalOpen(false);
      setPendingImportFile(null);
      if (importInputRef.current) {
        importInputRef.current.value = '';
      }
    }
  };

  const handleDeleteAllData = async () => {
    setDeletingAll(true);
    setDataResult(null);

    try {
      await softDeleteAllData();
      window.location.reload();
    } catch (err) {
      const detail = err instanceof Error ? err.message : UI.common.error;
      setDataResult({ ok: false, message: `${UI.common.error} ${detail}` });
      setDeletingAll(false);
    }
  };

  return (
    <main className={styles.page}>
      <h1 className={styles.heading}>{UI.settings.heading}</h1>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{UI.settings.appearance}</h2>

        <fieldset className={styles.group}>
          <legend className={styles.label}>{UI.settings.theme}</legend>
          <label className={styles.option}>
            <input
              type="radio"
              name="theme"
              checked={theme === 'system'}
              onChange={() => void saveTheme('system')}
            />
            {UI.settings.themeSystem}
          </label>
          <label className={styles.option}>
            <input
              type="radio"
              name="theme"
              checked={theme === 'light'}
              onChange={() => void saveTheme('light')}
            />
            {UI.settings.themeLight}
          </label>
          <label className={styles.option}>
            <input
              type="radio"
              name="theme"
              checked={theme === 'dark'}
              onChange={() => void saveTheme('dark')}
            />
            {UI.settings.themeDark}
          </label>
        </fieldset>

        <div className={styles.group}>
          <label className={styles.label} htmlFor="language-display">
            {UI.settings.language}
          </label>
          <select
            id="language-display"
            className={styles.input}
            value={UI.settings.languageBritishEnglish}
            disabled
            aria-readonly="true"
          >
            <option value={UI.settings.languageBritishEnglish}>
              {UI.settings.languageBritishEnglish}
            </option>
          </select>
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{UI.settings.llm}</h2>

        <div className={styles.group}>
          <label className={styles.label} htmlFor="llm-provider">
            {UI.settings.llmProvider}
          </label>
          <select
            id="llm-provider"
            className={styles.input}
            value={provider}
            onChange={(event) => {
              const next = event.target.value as LlmProvider;
              setProvider(next);
              if (!model.trim()) {
                setModel(DEFAULT_MODEL_BY_PROVIDER[next]);
              }
            }}
          >
            <option value="gemini">{UI.settings.llmProviderGemini}</option>
            <option value="openai">{UI.settings.llmProviderOpenAI}</option>
            <option value="ollama">{UI.settings.llmProviderOllama}</option>
          </select>
        </div>

        {provider !== 'ollama' && (
          <div className={styles.group}>
            <label className={styles.label} htmlFor="llm-api-key">
              {UI.settings.llmApiKey}
            </label>
            <div className={styles.apiKeyRow}>
              <input
                id="llm-api-key"
                className={styles.input}
                type={showApiKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
              />
              <button
                type="button"
                className={styles.ghostButton}
                onClick={() => setShowApiKey((v) => !v)}
              >
                {showApiKey ? UI.settings.hideApiKey : UI.settings.showApiKey}
              </button>
            </div>
          </div>
        )}

        {provider !== 'gemini' && (
          <div className={styles.group}>
            <label className={styles.label} htmlFor="llm-base-url">
              {UI.settings.llmBaseUrl}
            </label>
            <input
              id="llm-base-url"
              className={styles.input}
              type="text"
              value={baseUrl}
              onChange={(event) => setBaseUrl(event.target.value)}
            />
          </div>
        )}

        <div className={styles.group}>
          <label className={styles.label} htmlFor="llm-model">
            {UI.settings.llmModel}
          </label>
          <input
            id="llm-model"
            className={styles.input}
            type="text"
            value={model}
            placeholder={modelPlaceholder}
            onChange={(event) => setModel(event.target.value)}
          />
        </div>

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={() => void handleSave()}
            disabled={saving}
          >
            {UI.common.save}
          </button>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={() => void handleTestConnection()}
            disabled={testing}
          >
            {UI.settings.testConnection}
          </button>
        </div>

        {testResult && (
          <p className={testResult.ok ? styles.success : styles.error}>
            {testResult.message}
          </p>
        )}
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{UI.settings.dataManagement}</h2>

        <div className={styles.group}>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={() => void handleExportData()}
            disabled={exportingData}
          >
            {UI.settings.exportData}
          </button>
        </div>

        <div className={styles.group}>
          <input
            ref={importInputRef}
            type="file"
            accept=".json,application/json"
            className={styles.hiddenInput}
            onChange={handleFileSelected}
          />
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={handleImportClick}
            disabled={importingData}
          >
            {UI.settings.importData}
          </button>
        </div>

        <div className={`${styles.group} ${styles.dangerZone}`}>
          <h3 className={styles.dangerTitle}>{UI.settings.dangerZone}</h3>
          <button
            type="button"
            className={styles.dangerButton}
            onClick={() => setDeleteModalOpen(true)}
            disabled={deletingAll}
          >
            {UI.settings.deleteAllData}
          </button>
        </div>

        {dataResult && (
          <p className={dataResult.ok ? styles.success : styles.error}>
            {dataResult.message}
          </p>
        )}
      </section>

      <ConfirmImportModal
        isOpen={importModalOpen}
        fileName={pendingImportFile?.name ?? ''}
        importing={importingData}
        onClose={() => {
          setImportModalOpen(false);
          setPendingImportFile(null);
        }}
        onConfirm={() => void handleConfirmImport()}
      />

      <ConfirmDeleteModal
        isOpen={deleteModalOpen}
        deleting={deletingAll}
        onClose={() => setDeleteModalOpen(false)}
        onConfirm={() => void handleDeleteAllData()}
      />
    </main>
  );
}
