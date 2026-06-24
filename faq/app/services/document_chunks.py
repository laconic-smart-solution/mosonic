from langchain_text_splitters import RecursiveCharacterTextSplitter


def split_text_into_chunks(text: str) -> list[str]:
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=1200,
        chunk_overlap=150,
    )
    return [chunk for chunk in splitter.split_text(text) if chunk.strip()]
