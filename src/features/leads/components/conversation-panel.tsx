import { formatDate } from '../../../api/client';
import type { LeadMessage } from '../../../api/leads';
import { EmptyState } from '../../../components/ui/data-state';

export function ConversationPanel({
  messages,
}: {
  readonly messages: readonly LeadMessage[];
}): React.JSX.Element {
  return (
    <section className="panel conversation-panel" aria-labelledby="conversation-title">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Source context</span>
          <h2 id="conversation-title">Conversation</h2>
        </div>
        <span className="count-pill">{messages.length} messages</span>
      </div>
      {messages.length === 0 ? (
        <EmptyState
          title="No messages captured"
          description="Run a Gmail sync to pull the source conversation into this workspace."
        />
      ) : (
        <div className="conversation-list">
          {messages.map((message) => (
            <article className="message-card" key={message.id}>
              <div className="message-meta">
                <strong>{message.sender}</strong>
                <time dateTime={message.receivedAt}>{formatDate(message.receivedAt)}</time>
              </div>
              <h3>{message.subject || 'No subject'}</h3>
              <p>{message.body}</p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
