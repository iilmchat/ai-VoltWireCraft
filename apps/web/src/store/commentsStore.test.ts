// © 2026 RuChating (iilmchat) · VoltWireCraft v0.9.0
import { beforeEach, describe, expect, it } from 'vitest';
import { useCommentsStore } from './commentsStore.js';

describe('журнал замечаний', () => {
    beforeEach(() => {
        useCommentsStore.setState({ comments: [], filter: 'all', drawerOpen: false });
    });

    it('создаёт замечание с привязкой к вкладке и узлу', () => {
        useCommentsStore.getState().addComment('Проверить щит', 'singleLine', 'node-1', 'Иван');
        const comment = useCommentsStore.getState().comments[0];
        expect(comment?.text).toBe('Проверить щит');
        expect(comment?.view).toBe('singleLine');
        expect(comment?.nodeId).toBe('node-1');
        expect(comment?.status).toBe('open');
    });

    it('изменяет статус и фильтрует список', () => {
        useCommentsStore.getState().addComment('Замечание', 'plan', null, 'Гость');
        const id = useCommentsStore.getState().comments[0]?.id;
        expect(id).toBeDefined();
        if (id === undefined) {
            return;
        }
        useCommentsStore.getState().resolveComment(id);
        expect(useCommentsStore.getState().comments[0]?.status).toBe('resolved');
        useCommentsStore.setState({ filter: 'open' });
        expect(useCommentsStore.getState().comments.filter((item) => item.status === 'open')).toHaveLength(0);
        useCommentsStore.getState().reopenComment(id);
        expect(useCommentsStore.getState().comments[0]?.status).toBe('open');
    });
});
