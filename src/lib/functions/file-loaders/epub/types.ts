export interface EpubMetadataMeta {
  '@_name': string;
  '@_content': string;
}

export interface EpubManifestItem {
  '@_href': string;
  '@_id': string;
  '@_media-type': string;
  '@_properties'?: string;
  '@_fallback'?: string;
}

export interface EpubSpineItemRef {
  '@_idref': string;
}

type EpubMetadataValue =
  | string
  | {
      '#text': string;
    };

export interface EpubContent {
  package: {
    metadata: {
      'dc:title': EpubMetadataValue | EpubMetadataValue[];
      'dc:creator'?: EpubMetadataValue | EpubMetadataValue[];
      'dc:language': EpubMetadataValue | EpubMetadataValue[];
      meta?: EpubMetadataMeta | EpubMetadataMeta[];
    };
    manifest: {
      item: EpubManifestItem[];
    };
    spine: {
      itemref: EpubSpineItemRef[];
    };
  };
}

export interface EpubOPFContent {
  'opf:package': {
    'opf:metadata': {
      'dc:title': EpubMetadataValue | EpubMetadataValue[];
      'dc:creator'?: EpubMetadataValue | EpubMetadataValue[];
      'dc:language': EpubMetadataValue | EpubMetadataValue[];
      'opf:meta'?: EpubMetadataMeta | EpubMetadataMeta[];
    };
    'opf:manifest': {
      'opf:item': EpubManifestItem[];
    };
    'opf:spine': {
      'opf:itemref': EpubSpineItemRef[];
    };
  };
}

export function isOPFType(contents: EpubContent | EpubOPFContent): contents is EpubOPFContent {
  return (contents as EpubOPFContent)['opf:package'] !== undefined;
}
