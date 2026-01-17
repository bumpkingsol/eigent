import { Client } from '@notionhq/client';

export interface NotionPage {
  id: string;
  title: string;
  url: string;
  lastEdited: string;
}

export interface CreatePageParams {
  parentId: string;
  title: string;
  content?: string;
  properties?: Record<string, any>;
}

export class NotionIntegration {
  private notion: Client;

  constructor(apiKey: string) {
    this.notion = new Client({ auth: apiKey });
  }

  async searchPages(query: string, limit: number = 10): Promise<NotionPage[]> {
    const response = await this.notion.search({
      query,
      filter: { property: 'object', value: 'page' },
      page_size: limit,
    });

    return response.results
      .filter((r): r is any => r.object === 'page')
      .map((page) => ({
        id: page.id,
        title: this.extractTitle(page),
        url: page.url,
        lastEdited: page.last_edited_time,
      }));
  }

  async createPage(params: CreatePageParams): Promise<string> {
    const response = await this.notion.pages.create({
      parent: { page_id: params.parentId },
      properties: {
        title: {
          title: [{ text: { content: params.title } }],
        },
        ...params.properties,
      },
      children: params.content
        ? [
            {
              object: 'block',
              type: 'paragraph',
              paragraph: {
                rich_text: [{ type: 'text', text: { content: params.content } }],
              },
            },
          ]
        : [],
    });

    return response.id;
  }

  async appendToPage(pageId: string, content: string): Promise<void> {
    await this.notion.blocks.children.append({
      block_id: pageId,
      children: [
        {
          object: 'block',
          type: 'paragraph',
          paragraph: {
            rich_text: [{ type: 'text', text: { content } }],
          },
        },
      ],
    });
  }

  async archivePage(pageId: string): Promise<void> {
    await this.notion.pages.update({
      page_id: pageId,
      archived: true,
    });
  }

  async getPage(pageId: string): Promise<NotionPage | null> {
    try {
      const page = await this.notion.pages.retrieve({ page_id: pageId }) as any;
      return {
        id: page.id,
        title: this.extractTitle(page),
        url: page.url,
        lastEdited: page.last_edited_time,
      };
    } catch {
      return null;
    }
  }

  private extractTitle(page: any): string {
    const titleProp = page.properties?.title || page.properties?.Name;
    if (titleProp?.title?.[0]?.plain_text) {
      return titleProp.title[0].plain_text;
    }
    return 'Untitled';
  }
}
