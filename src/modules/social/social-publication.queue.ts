export const SOCIAL_PUBLICATION_QUEUE = 'social-publication';

export interface SocialPublicationJob {
  publicationId: string;
  revision: number;
}
