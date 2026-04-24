import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import TopBar from '@/components/Layout/TopBar';
import PriorityBadge from '@/components/PriorityBadge';
import WeatherPanel from '@/components/WeatherPanel';
import SpeciesRecommendations from '@/components/SpeciesRecommendations';
import AssignSheet from '@/components/AssignSheet';
import ShareToChatSheet from '@/components/ShareToChatSheet';
import TagActions from '@/components/TagActions';
import { db } from '@/data/db';
import { CONTACTS } from '@/data/mocks';
import { initials } from '@/data/currentUser';
import { useTranslation } from '@/i18n';

export default function ObservationDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const t = useTranslation();

  const observation = useLiveQuery(() => (id ? db.observations.get(id) : undefined), [id]);
  const photo = useLiveQuery(() => (id ? db.photos.where('observationId').equals(id).first() : undefined), [id]);
  const tasks = useLiveQuery(() => (id ? db.tasks.where('observationId').equals(id).toArray() : []), [id]) ?? [];
  const [assignOpen, setAssignOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  const assignee = tasks[0] ? CONTACTS.find((c) => c.id === tasks[0].assigneeId) : undefined;

  if (!observation) {
    return (
      <div className="flex h-full flex-col">
        <TopBar title={t('details.title')} />
        <p className="p-margin-main text-on-surface-variant">{t('details.notFound')}</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-col bg-background pb-24">
      <TopBar
        title={t('details.title')}
        leading={
          <button
            onClick={() => navigate(-1)}
            className="touch-safe flex items-center justify-center rounded-full hover:bg-surface-container"
            aria-label={t('common.back')}
          >
            <span className="material-symbols-outlined text-primary">arrow_back</span>
          </button>
        }
        trailing={
          <>
            <button
              onClick={() => navigate(`/observations/${observation.id}/navigate`)}
              className="touch-safe flex items-center justify-center rounded-full hover:bg-surface-container"
              aria-label={t('navigate.title')}
            >
              <span className="material-symbols-outlined text-primary-container">navigation</span>
            </button>
            <button
              onClick={() => setShareOpen(true)}
              className="touch-safe flex items-center justify-center rounded-full hover:bg-surface-container"
              aria-label={t('share.title')}
            >
              <span className="material-symbols-outlined text-primary-container">share</span>
            </button>
          </>
        }
      />

      {/* Hero */}
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-surface-container">
        {photo?.blob ? (
          <img src={URL.createObjectURL(photo.blob)} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-outline">
            <span className="material-symbols-outlined text-6xl">image</span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
      </div>

      {/* Card */}
      <div className="relative z-10 -mt-6 px-margin-main">
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-5 shadow-[0_4px_20px_rgba(0,0,0,0.08)]">
          <div className="mb-4 flex items-start justify-between">
            <PriorityBadge priority={observation.priority} />
            <div className="flex flex-col items-end">
              <span className="text-[10px] uppercase text-outline">{t('details.id')}</span>
              <span className="font-mono text-xs font-semibold text-on-surface-variant">
                {observation.id.slice(0, 8).toUpperCase()}
              </span>
            </div>
          </div>

          <div className="space-y-stack-lg">
            <div className="grid grid-cols-2 gap-gutter-grid pt-2">
              <Meta label={t('details.date')} value={new Date(observation.capturedAt).toLocaleDateString()} />
              <Meta label={t('details.time')} value={new Date(observation.capturedAt).toLocaleTimeString()} />
            </div>

            <div className="flex items-center justify-between rounded-lg bg-surface-container-low p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded bg-primary-container">
                  <span className="material-symbols-outlined filled text-on-primary">location_on</span>
                </div>
                <div>
                  <p className="text-label-sm uppercase text-outline">{t('details.coordinates')}</p>
                  <p className="font-mono text-body-md font-medium text-on-surface">
                    {observation.lat.toFixed(4)}° N, {observation.lng.toFixed(4)}° E
                  </p>
                </div>
              </div>
            </div>

            {observation.description && (
              <div className="space-y-2">
                <h3 className="text-label-sm uppercase tracking-widest text-outline">{t('details.description')}</h3>
                <div className="rounded-lg border-2 border-surface-container p-4">
                  <p className="text-body-lg italic leading-relaxed text-on-surface">&ldquo;{observation.description}&rdquo;</p>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between">
              <span className="text-label-sm uppercase text-outline">{t('details.category')}</span>
              <span className="text-body-md font-semibold text-on-surface">
                {t(`category.${observation.category}`)}
              </span>
            </div>

            {assignee && (
              <div className="flex items-center justify-between rounded-lg bg-surface-container-low p-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-container text-on-primary text-label-sm font-bold">
                    {initials(assignee.name)}
                  </div>
                  <div>
                    <p className="text-label-sm uppercase text-outline">{t('assign.assignedTo')}</p>
                    <p className="text-body-md font-medium">{assignee.name}</p>
                  </div>
                </div>
                {tasks[0]?.dueAt && (
                  <span className="text-label-sm text-outline">
                    {new Date(tasks[0].dueAt).toLocaleDateString()}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="mt-stack-lg">
          <WeatherPanel lat={observation.lat} lng={observation.lng} />
        </div>

        {observation.category === 'reforestation' && (
          <div className="mt-stack-lg">
            <SpeciesRecommendations lat={observation.lat} lng={observation.lng} />
          </div>
        )}

        <div className="mt-stack-lg">
          <TagActions observationId={observation.id} />
        </div>
      </div>

      {/* Action */}
      <div className="fixed bottom-0 left-0 z-40 w-full border-t border-outline-variant bg-surface-container-lowest p-margin-main">
        <button
          onClick={() => setAssignOpen(true)}
          className="touch-safe flex w-full items-center justify-center gap-2 rounded-lg bg-primary text-on-primary shadow-lg active:scale-[0.98]"
        >
          <span className="material-symbols-outlined">assignment_ind</span>
          <span className="font-semibold uppercase tracking-widest">
            {assignee ? t('assign.reassign') : t('assign.button')}
          </span>
        </button>
      </div>

      <AssignSheet
        open={assignOpen}
        observationId={observation.id}
        onClose={() => setAssignOpen(false)}
      />
      <ShareToChatSheet
        open={shareOpen}
        observationId={observation.id}
        defaultBody={observation.description}
        onClose={() => setShareOpen(false)}
      />
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 border-l-4 border-primary-container pl-3">
      <span className="text-label-sm text-outline">{label}</span>
      <span className="text-body-md font-semibold text-on-surface">{value}</span>
    </div>
  );
}
