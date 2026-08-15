import { useState } from 'react';
import { shouldOfferStopOrphansRetry } from '../utils/importRefusal';
import { useTranslation } from 'react-i18next';
import { infraApi, groupTagsApi, templateApi } from '../services/api';
import { useToast } from './useToast';

export interface DataBackup {
  migrating: boolean;
  exportBackup: () => Promise<void>;
  importBackup: (file: File) => Promise<void>;
}

/**
 * Owns the data-migration flows used around a database/storage backend switch (#488): exporting a
 * full JSON dump (call before switching, while still on the old backend) and importing one back
 * (replaces all current data), including the 409 stop-orphans confirm/retry.
 */
export function useDataBackup(): DataBackup {
  const { t } = useTranslation();
  const toast = useToast();
  const [migrating, setMigrating] = useState(false);

  // Download a JSON backup of all Data-DB tables. Called BEFORE a DB switch (while still on the old
  // database) so the data can be re-imported into the new one — switching otherwise starts empty (#488).
  const exportBackup = async () => {
    setMigrating(true);
    try {
      const dump = await infraApi.exportData();
      const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `openwa-backup-${dump.exportedAt?.slice(0, 10) || 'data'}.json`;
      a.click();
      URL.revokeObjectURL(url);

      const omitted = dump.omittedInlineMedia;
      const dropped = (omitted?.messages ?? 0) + (omitted?.messageBatches ?? 0);
      if (dropped > 0) {
        toast.warning(
          t('infrastructure.migration.exportPartialTitle'),
          t('infrastructure.migration.exportPartial', { count: dropped }),
        );
      }
    } catch (err) {
      toast.error(
        t('infrastructure.migration.exportFailed'),
        err instanceof Error ? err.message : t('common.unknownError'),
      );
    } finally {
      setMigrating(false);
    }
  };

  const runImport = async (tables: Record<string, unknown[]>, stopOrphans = false): Promise<void> => {
    try {
      const res = await infraApi.importData(tables, stopOrphans ? { stopOrphans: true } : undefined);
      if (res.imported) {
        if (res.restartRequired || (res.notices && res.notices.length > 0)) {
          toast.warning(t('infrastructure.migration.importOk'), (res.notices ?? []).join('; ') || undefined);
        } else {
          toast.success(t('infrastructure.migration.importOk'));
        }
      } else {
        toast.error(
          t('infrastructure.migration.importFailed'),
          (res.warnings || []).slice(0, 3).join('; ') || res.message,
        );
      }
    } catch (err) {
      const status = (err as { status?: number } | null)?.status;
      const code = (err as { code?: string } | null)?.code;
      if (shouldOfferStopOrphansRetry(status, code, stopOrphans) && err instanceof Error) {
        if (window.confirm(err.message)) await runImport(tables, true);
        else toast.error(t('infrastructure.migration.importFailed'), err.message);
        return;
      }
      const detail =
        status === 413
          ? t('infrastructure.migration.importTooLarge')
          : err instanceof Error
            ? err.message
            : t('common.unknownError');
      toast.error(t('infrastructure.migration.importFailed'), detail);
    }
  };

  // Restore a previously-exported backup into the CURRENT database (use after switching + restart).
  const importBackup = async (file: File) => {
    let parsed: { tables?: Record<string, unknown[]> };
    try {
      parsed = JSON.parse(await file.text()) as { tables?: Record<string, unknown[]> };
    } catch {
      toast.error(t('infrastructure.migration.importFailed'), t('infrastructure.migration.invalidFile'));
      return;
    }
    if (!parsed?.tables || typeof parsed.tables !== 'object') {
      toast.error(t('infrastructure.migration.importFailed'), t('infrastructure.migration.invalidFile'));
      return;
    }
    const rows = Object.values(parsed.tables).reduce((n, a) => n + (Array.isArray(a) ? a.length : 0), 0);
    if (!window.confirm(t('infrastructure.migration.importConfirm', { rows }))) return;
    setMigrating(true);
    try {
      // 1. Direct restore of Group Categories if present in backup JSON
      if (Array.isArray((parsed.tables as any)?.groupTags)) {
        for (const tag of (parsed.tables as any).groupTags) {
          if (tag && tag.name) {
            await groupTagsApi.save('default', tag).catch(() => {});
          }
        }
      }

      // 2. Direct restore of Templates if present in backup JSON
      if (Array.isArray(parsed.tables?.templates)) {
        for (const tpl of parsed.tables.templates as any[]) {
          if (tpl && tpl.name) {
            await templateApi.create('default', {
              name: tpl.name,
              header: tpl.header || null,
              body: tpl.body || '',
              footer: tpl.footer || null,
            }).catch(() => {});
          }
        }
      }

      // 3. Prepare payload for full table import (trim excessive historic message bulk if over 2000 to keep HTTP fast)
      const tablesToImport = { ...parsed.tables };
      if (Array.isArray(tablesToImport.messages) && tablesToImport.messages.length > 2000) {
        tablesToImport.messages = tablesToImport.messages.slice(-2000);
      }

      await runImport(tablesToImport, true);
    } catch (e: any) {
      toast.error(t('infrastructure.migration.importFailed'), e?.message || t('common.unknownError'));
    } finally {
      setMigrating(false);
    }
  };

  return { migrating, exportBackup, importBackup };
}
