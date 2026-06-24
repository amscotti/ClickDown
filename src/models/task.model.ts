export const TASK_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const TaskPriority = {
  Low: 'low',
  Medium: 'medium',
  High: 'high',
  Urgent: 'urgent',
} as const;

export interface Task {
  id: string;
  columnId: string;
  title: string;
  description: string | null;
  position: number;
  priority: TaskPriority;
  assigneeId: string | null;
  dueDate: Date | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  archived?: boolean;
}

export interface TaskWithDetails extends Task {
  // Additional fields when joining with related tables
  assigneeName?: string | null;
  assigneeAvatarSeed?: string | null;
  creatorName?: string;
  creatorAvatarSeed?: string;
  columnBoardId?: string;
  columnTeamId?: string;
  columnName?: string;
  boardName?: string;
  boardSlug?: string;
  teamName?: string;
  teamSlug?: string;
}

export interface TaskWithRelations extends Task {
  // Full relations when needed
  assignee?: {
    id: string;
    displayName: string;
    avatarSeed: string;
  } | null;
  creator?: {
    id: string;
    displayName: string;
    avatarSeed: string;
  };
  column?: {
    id: string;
    name: string;
    boardId: string;
  };
}

export interface CreateTaskInput {
  columnId: string;
  title: string;
  description?: string;
  position?: number;
  priority?: TaskPriority;
  assigneeId?: string;
  dueDate?: Date | string;
  createdBy: string;
}

export interface UpdateTaskInput {
  title?: string;
  description?: string;
  columnId?: string;
  position?: number;
  priority?: TaskPriority;
  assigneeId?: string | null;
  dueDate?: Date | string | null;
}

export interface MoveTaskInput {
  columnId: string;
  position: number;
}
