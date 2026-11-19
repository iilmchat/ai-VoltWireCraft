/** Единый формат ответа и ошибок REST API (RULES § 1.6). */
export interface ApiResponse<TData> {
  /** Признак успешности запроса. */
  readonly success: boolean;
  /** Полезная нагрузка ответа. */
  readonly data: TData;
  /** Человекочитаемое сообщение. */
  readonly message: string;
}
