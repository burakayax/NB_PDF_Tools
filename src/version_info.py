"""
Single source of truth for desktop distribution version and product metadata.
Bump __version__ here for each customer release; sync build/version_file.txt for Windows PE info.
"""

from __future__ import annotations

__version__ = "1.0.0"

PRODUCT_NAME = "NB PDF Tools"
INTERNAL_NAME = "NB_PDF_Tools"
COMPANY_NAME = "NB Global Studio"
COPYRIGHT = "Copyright © NB Global Studio"
FILE_DESCRIPTION = "NB PDF Tools — PDF suite for Windows"


def get_version_string() -> str:
    return __version__


def get_version_tuple() -> tuple[int, int, int, int]:
    """Windows FILEVERSION / ProductVersion (four uint16 components)."""
    parts = __version__.split(".")
    nums = [0, 0, 0, 0]
    for i in range(min(4, len(parts))):
        try:
            nums[i] = int(parts[i].split("-")[0].split("+")[0])
        except ValueError:
            nums[i] = 0
    return (nums[0], nums[1], nums[2], nums[3])


def get_display_title() -> str:
    return f"{PRODUCT_NAME} {__version__}"
