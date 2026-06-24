import { ChecklistSection } from '../components/checklist';
import { realtime } from '../realtime/realtime';
import { checklistAddSchema } from '../schemas';
import { activityService } from '../services/activity.service';
import { taskService } from '../services/task.service';
import { teamService } from '../services/team.service';
import { parseFormData, requireUser } from '../utils/http';
import { validateBody } from '../utils/validation';

export async function handleChecklistRoutes(
  req: Request,
  url: URL,
  method: string
): Promise<Response | null> {
  // ─── Checklist ──────────────────────────────────────────────────────────
  // Helper to verify task access for checklist operations
  async function verifyTaskAccess(req: Request, taskId: string) {
    const user = requireUser(req);
    if (user instanceof Response) return { user: null, error: user };
    try {
      const task = taskService.getByIdWithDetails(taskId);
      if (!task.columnTeamId || !teamService.isTeamMember(task.columnTeamId, user.id)) {
        return { user, error: new Response('Access Denied', { status: 403 }) };
      }
      return { user, task };
    } catch {
      return { user, error: new Response('Task not found', { status: 404 }) };
    }
  }

  // Broadcast the refreshed checklist section to other viewers who may have
  // the same task's modal open. No-op if nobody else has it open (the OOB
  // swap targets #checklist-section-<taskId> which only exists in open modals).
  async function broadcastChecklist(boardId: string | undefined, taskId: string) {
    if (!boardId) return;
    const html = await (
      <ChecklistSection
        checklist={taskService.getChecklist(taskId)}
        taskId={taskId}
        swapOob={true}
      />
    );
    realtime.broadcastHtml(boardId, html);
  }

  // Add checklist item (POST /tasks/:id/checklist)
  if (url.pathname.match(/^\/tasks\/[^/]+\/checklist$/) && method === 'POST') {
    const taskId = url.pathname.split('/')[2] ?? '';
    const access = await verifyTaskAccess(req, taskId);
    if (access.error) return access.error;
    const data = await parseFormData(req);
    const input = validateBody(data, checklistAddSchema);
    if (input instanceof Response) return input;
    taskService.addChecklistItem(taskId, input.text);
    activityService.record(taskId, 'added checklist item', access.user.id);
    await broadcastChecklist(access.task?.columnBoardId, taskId);
    const html = await (
      <ChecklistSection checklist={taskService.getChecklist(taskId)} taskId={taskId} />
    );
    return new Response(html, {
      headers: { 'Content-Type': 'text/html', 'HX-Trigger': 'task-updated' },
    });
  }

  // Toggle checklist item (POST /tasks/:id/checklist/:itemId/toggle)
  if (url.pathname.match(/^\/tasks\/[^/]+\/checklist\/[^/]+\/toggle$/) && method === 'POST') {
    const taskId = url.pathname.split('/')[2] ?? '';
    const itemId = url.pathname.split('/')[4] ?? '';
    const access = await verifyTaskAccess(req, taskId);
    if (access.error) return access.error;
    try {
      taskService.toggleChecklistItem(taskId, itemId);
      activityService.record(taskId, 'toggled checklist item', access.user.id);
      await broadcastChecklist(access.task?.columnBoardId, taskId);
      const html = await (
        <ChecklistSection checklist={taskService.getChecklist(taskId)} taskId={taskId} />
      );
      return new Response(html, {
        headers: { 'Content-Type': 'text/html', 'HX-Trigger': 'task-updated' },
      });
    } catch {
      return new Response('Item not found', { status: 404 });
    }
  }

  // Delete checklist item (POST /tasks/:id/checklist/:itemId/delete)
  if (url.pathname.match(/^\/tasks\/[^/]+\/checklist\/[^/]+\/delete$/) && method === 'POST') {
    const taskId = url.pathname.split('/')[2] ?? '';
    const itemId = url.pathname.split('/')[4] ?? '';
    const access = await verifyTaskAccess(req, taskId);
    if (access.error) return access.error;
    try {
      taskService.deleteChecklistItem(taskId, itemId);
    } catch {
      return new Response('Item not found', { status: 404 });
    }
    activityService.record(taskId, 'deleted checklist item', access.user.id);
    await broadcastChecklist(access.task?.columnBoardId, taskId);
    const html = await (
      <ChecklistSection checklist={taskService.getChecklist(taskId)} taskId={taskId} />
    );
    return new Response(html, {
      headers: { 'Content-Type': 'text/html', 'HX-Trigger': 'task-updated' },
    });
  }

  return null;
}
