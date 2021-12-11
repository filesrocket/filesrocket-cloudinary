import { ServiceMethods, Paginated, Query, FileEntity, ResultEntity } from "filesrocket";
import { GenerateFilename, Service } from "filesrocket/lib/common";
import cloudinary, { UploadApiResponse } from "cloudinary";
import { omitProps } from "filesrocket/lib/utils";
import { NotFound } from "filesrocket/lib/errors";

import { convertToExpression, CustomFilename } from "../utils";
import { CloudinaryOptions, FileResults } from "../index";
import { FileBaseService } from "./file-base.service";

@Service({
  name: "cloudinary",
  type: "Files"
})
export class FileService extends FileBaseService implements Partial<ServiceMethods> {
  constructor(options: CloudinaryOptions) {
    super(options);
    cloudinary.v2.config(options);
  }

  @GenerateFilename({
    strategy: CustomFilename
  })
  async create(data: FileEntity, query: Query): Promise<ResultEntity> {
    return new Promise((resolve, reject) => {
      const callback = (err: any, result: UploadApiResponse | undefined) => {
        !result || err ? reject(err) : resolve(this.builder(result));
      };

      const partialQuery = omitProps(query, ["path"]);
      const props = {
        resource_type: "auto",
        ...partialQuery,
        folder: query.path,
        public_id: data.name
      };

      const uploader = cloudinary.v2.uploader.upload_stream(props, callback);

      data.stream.pipe(uploader);
    });
  }

  async list(query: Query): Promise<Paginated<ResultEntity>> {
    const { pagination } = this.options;
    const paginate: number = query.size <= pagination.max
      ? query.size
      : pagination.default;

    const partialQuery = omitProps(query, ["size", "page", "path"]);
    const exp: string = convertToExpression(
      { ...partialQuery, folder: query.path },
      " AND "
    );

    const data = await cloudinary.v2.search
      .expression(exp)
      .max_results(paginate)
      .next_cursor(query.page)
      .execute();

    return this.paginate(data);
  }

  async get(id: string, query: Query = {}): Promise<ResultEntity> {
    const partialQuery = omitProps(query, ["path"]);
    const exp: string = convertToExpression({
      ...partialQuery,
      folder: query.path,
      public_id: id
    }, " AND ");

    const data: FileResults = await cloudinary.v2.search
      .expression(exp)
      .execute();

    if (!data.resources.length) {
      throw new NotFound("The file does not exist.");
    }

    return this.builder(data.resources[0]);
  }

  async remove(path: string, query: Query): Promise<ResultEntity> {
    const file = await this.get(path, {});
    
    const partialQuery = omitProps(query, ["path"]);
    const params = {
      resource_type: file.resource_type,
      ...partialQuery,
      folder: query.path
    };

    await cloudinary.v2.api.delete_resources([path], params);
    return file;
  }
}