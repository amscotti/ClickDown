export interface Board {
  id: string;
  teamId: string;
  name: string;
  slug: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Column {
  id: string;
  boardId: string;
  name: string;
  position: number;
  wipLimit: number | null;
  color: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface BoardWithColumns extends Board {
  columns: Column[];
}

export interface BoardWithStats extends Board {
  columnCount: number;
  taskCount: number;
}
