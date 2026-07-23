import {
  analyzeDailyActivity,
  easternHour,
  easternDateString,
  finalizeDailyActivity,
  isWeekdayEastern,
  renderActivityEmail,
  sendActivityEmail,
  supabase,
  upsertReview,
} from './_dailyActivity.js';

export const maxDuration = 60;

function canRun(req) {
  const secret = process.env.ACTIVITY_INTELLIGENCE_SECRET;
  if (!secret) return true;
  const provided = req.headers['x-activity-secret'] || req.query?.secret;
  return provided === secret;
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).end();
  if (!canRun(req)) return res.status(401).json({ error: 'Unauthorized' });

  const body = req.method === 'POST' ? (req.body || {}) : {};
  const mode = body.mode || req.query?.mode || 'draft';
  const activityDate = body.activityDate || req.query?.date || easternDateString();
  const now = new Date();
  const hourEastern = easternHour(now);

  if ((mode === 'review' || mode === 'finalize' || mode === 'review-due' || mode === 'finalize-due') && !isWeekdayEastern(now)) {
    return res.status(200).json({ ok: true, skipped: true, reason: 'weekday_only', activityDate });
  }

  try {
    if (mode === 'email-test') {
      const analysis = {
        activityDate,
        generatedAt: new Date().toISOString(),
        counts: {
          ownersIdentified: 1,
          ownersWorked: 1,
          actions: 1,
          conversations: 1,
          calls: 1,
          voicemails: 0,
          emails: 0,
          tractiqReportsSent: 0,
          meetingsSet: 0,
        },
        importantItems: [{
          label: 'Daily Activity Intelligence',
          type: 'email-test',
          reason: 'Email delivery test',
          note: 'If you received this, the nightly debrief email sender is configured correctly.',
        }],
        slippedItems: [],
        evidence: [],
      };
      const email = await sendActivityEmail(analysis, 'review');
      return res.status(200).json({ ok: true, activityDate, email });
    }

    if (mode === 'review-due') {
      if (hourEastern < 17) return res.status(200).json({ ok: true, skipped: true, reason: 'before_5pm_et', activityDate, hourEastern });
      const { data: existing } = await supabase
        .from('daily_activity_reviews')
        .select('status, review_sent_at')
        .eq('activity_date', activityDate)
        .maybeSingle();
      if (existing?.review_sent_at || existing?.status === 'approved' || existing?.status === 'auto_logged') {
        return res.status(200).json({ ok: true, skipped: true, reason: 'review_already_sent_or_finalized', activityDate, status: existing.status });
      }
    }

    if (mode === 'finalize-due') {
      if (hourEastern < 20) return res.status(200).json({ ok: true, skipped: true, reason: 'before_8pm_et', activityDate, hourEastern });
      const { data: existing } = await supabase
        .from('daily_activity_reviews')
        .select('status')
        .eq('activity_date', activityDate)
        .maybeSingle();
      if (existing?.status === 'approved' || existing?.status === 'auto_logged') {
        return res.status(200).json({ ok: true, skipped: true, reason: 'already_finalized', activityDate, status: existing.status });
      }
    }

    if (mode === 'status') {
      const { data, error } = await supabase
        .from('daily_activity_reviews')
        .select('*')
        .eq('activity_date', activityDate)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true, activityDate, review: data });
    }

    const analysis = await analyzeDailyActivity(activityDate);

    if (mode === 'draft') {
      await upsertReview(analysis, 'draft');
      return res.status(200).json({ ok: true, activityDate, analysis });
    }

    if (mode === 'review' || mode === 'review-due') {
      const emailResult = await sendActivityEmail(analysis, 'review');
      await upsertReview(analysis, 'review_sent', emailResult.ok ? 'sent' : emailResult.skipped ? 'email_not_configured' : 'email_failed');
      return res.status(200).json({ ok: true, activityDate, analysis, email: emailResult });
    }

    if (mode === 'finalize' || mode === 'finalize-due') {
      const { data: existingReview } = await supabase
        .from('daily_activity_reviews')
        .select('status, summary')
        .eq('activity_date', activityDate)
        .maybeSingle();
      if (existingReview?.status === 'approved' || existingReview?.status === 'auto_logged') {
        return res.status(200).json({ ok: true, skipped: true, reason: 'already_finalized', activityDate, status: existingReview.status });
      }
      await upsertReview(analysis, 'draft');
      const merged = await finalizeDailyActivity(activityDate, analysis.counts, 'auto_logged');
      const emailResult = await sendActivityEmail(analysis, 'final');
      return res.status(200).json({ ok: true, activityDate, analysis, merged, email: emailResult });
    }

    if (mode === 'approve') {
      const counts = body.counts;
      if (!counts) return res.status(400).json({ error: 'counts are required for approve mode' });
      await upsertReview({ ...analysis, counts }, 'draft');
      const merged = await finalizeDailyActivity(activityDate, counts, 'approved');
      return res.status(200).json({ ok: true, activityDate, merged });
    }

    if (mode === 'email-preview') {
      return res.status(200).json({ ok: true, activityDate, email: renderActivityEmail(analysis, 'review'), analysis });
    }

    return res.status(400).json({ error: `Unknown mode: ${mode}` });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
