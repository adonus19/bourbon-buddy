import { Timestamp } from '@angular/fire/firestore';
import { ArticleState as ArticleStateValue } from './enums';

// Subcollection: /users/{userId}/articleStates/{articleId}
// Only documents where the user has taken an action exist.
// Absence of a document = unread/unsaved.
export interface ArticleStateDoc {
  id?: string; // matches the corresponding newsArticles document ID
  state: ArticleStateValue;
  updatedAt: Timestamp;
}
